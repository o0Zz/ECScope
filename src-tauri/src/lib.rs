use tauri::Emitter;
use serde::{Serialize, Deserialize};
use std::fs;
use std::process::Command;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

static CANCEL_FLAG: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn cancel_transfer() {
    CANCEL_FLAG.store(true, Ordering::Relaxed);
}

#[derive(Serialize)]
struct AwsFiles {
    credentials: String,
    config: String,
}

#[tauri::command]
fn read_app_config() -> Result<String, String> {
    let candidates = vec![
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("ecscope.config.json"))),
        std::env::current_dir()
            .ok()
            .map(|d| d.join("ecscope.config.json")),
    ];

    for candidate in candidates.into_iter().flatten() {
        if candidate.exists() {
            return fs::read_to_string(&candidate).map_err(|e| {
                format!("Failed to read {}: {}", candidate.display(), e)
            });
        }
    }

    Err("ecscope.config.json not found. Place it next to the ECScope executable or in the working directory.".to_string())
}

#[tauri::command]
fn read_aws_files() -> Result<AwsFiles, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let aws_dir = home.join(".aws");

    let cred_path = aws_dir.join("credentials");
    let config_path = aws_dir.join("config");

    let credentials = fs::read_to_string(&cred_path)
        .map_err(|e| format!("Failed to read {}: {}", cred_path.display(), e))?;

    let config = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read {}: {}", config_path.display(), e))?;

    Ok(AwsFiles { credentials, config })
}

#[derive(Deserialize)]
struct SsmConnectParams {
    instance_id: String,
    profile: String,
    region: String,
    commands: Option<Vec<String>>,
    title: Option<String>,
}

#[derive(Deserialize)]
struct EcsExecParams {
    cluster: String,
    task_id: String,
    container: String,
    profile: String,
    region: String,
}

#[tauri::command]
fn open_ssm_session(params: SsmConnectParams) -> Result<(), String> {
    let cmd = if let Some(commands) = &params.commands {
        let commands_json: Vec<String> = commands
            .iter()
            .map(|c| format!("\"{}\"", c.replace('\\', "\\\\").replace('"', "\\\"")))
            .collect();
        let json_params = format!(r#"{{"command":[{}]}}"#, commands_json.join(","));

        let unique_id: u64 = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64;
        let params_filename = format!("ecscope_ssm_params_{}.json", unique_id);
        let params_path = std::env::temp_dir().join(&params_filename);
        {
            let mut file = fs::File::create(&params_path)
                .map_err(|e| format!("Failed to create params file: {}", e))?;
            file.write_all(json_params.as_bytes())
                .map_err(|e| format!("Failed to write params file: {}", e))?;
        }
        let params_file_ref = format!("file://{}", params_path.display());

        format!(
            "aws ssm start-session --target {} --document-name AWS-StartInteractiveCommand --parameters {} --profile {} --region {}",
            params.instance_id, params_file_ref, params.profile, params.region
        )
    } else {
        format!(
            "aws ssm start-session --target {} --profile {} --region {}",
            params.instance_id, params.profile, params.region
        )
    };

    open_in_terminal(&cmd, params.title.as_deref())
}

#[tauri::command]
fn open_ecs_exec(params: EcsExecParams) -> Result<(), String> {
    let cmd = format!(
        "aws ecs execute-command --cluster {} --task {} --container {} --interactive --command \"/bin/sh\" --profile {} --region {}",
        params.cluster, params.task_id, params.container, params.profile, params.region
    );
    open_in_terminal(&cmd, None)
}

fn open_in_terminal(cmd: &str, title: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let t = title.unwrap_or("");
        Command::new("cmd")
            .args(["/c", "start", t, "cmd", "/k", cmd])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        let escaped = cmd.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!("tell application \"Terminal\" to do script \"{}\"", escaped);
        Command::new("osascript")
            .args(["-e", &script])
            .spawn()
            .map_err(|e| format!("Failed to open terminal: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let terminals = ["x-terminal-emulator", "gnome-terminal", "xterm"];
        let mut launched = false;
        for term in &terminals {
            if Command::new(term)
                .args(["--", "sh", "-c", cmd])
                .spawn()
                .is_ok()
            {
                launched = true;
                break;
            }
        }
        if !launched {
            return Err("No terminal emulator found".to_string());
        }
    }

    Ok(())
}

// ─── SFTP file transfer via SSM port forwarding ───────────────────────────────
//
// Strategy: SSM opens a port-forward tunnel (EC2:22 → localhost:PORT).
// We then run `ssh ... "cat /remote"` (download) or `ssh ... "cat > /remote"` (upload)
// and stream bytes through Rust, emitting `sftp-progress` events with percent + rate
// as we go. This gives real progress for both directions without TTY tricks.
//
// For downloads: get the remote file size first via a quick `stat` SSH call so we
// can compute a real percentage.
// For uploads: local file size is known upfront.
//
// Rate is computed with a 1-second sliding window so the display stays responsive.

/// Tauri event payload emitted during a transfer.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TransferProgress {
    percent: u32,
    rate: String,
}

/// Returned by generate_ssh_keypair.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SshKeypair {
    key_id: String,
    public_key: String,
    private_key_path: String,
}

/// Parameters for sftp_download / sftp_upload.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TransferParams {
    instance_id: String,
    profile: String,
    region: String,
    remote_path: String,
    local_path: String,
    private_key_path: String,
    username: Option<String>,
}

/// Collected SSH connection details passed to helpers.
struct SshConn {
    key_path: String,
    port_str: String,
    host: String, // "user@127.0.0.1"
}

impl SshConn {
    /// Base args shared by every ssh/scp invocation.
    fn base_args(&self) -> Vec<&str> {
        vec![
            "-i", &self.key_path,
            "-p", &self.port_str,
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=/dev/null",
            "-o", "BatchMode=yes",
        ]
    }
}

/// Generate an ephemeral Ed25519 keypair via ssh-keygen.
/// The .pub file is read and deleted; only the private key file persists until
/// the transfer completes (Rust deletes it in do_transfer).
#[tauri::command]
fn generate_ssh_keypair() -> Result<SshKeypair, String> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let key_id = format!("ecscope-key-{}", ts);

    let priv_path = std::env::temp_dir().join(&key_id);
    let pub_path  = std::env::temp_dir().join(format!("{}.pub", key_id));

    let out = Command::new("ssh-keygen")
        .args([
            "-t", "ed25519",
            "-f", priv_path.to_str().ok_or("Non-UTF-8 temp path")?,
            "-N", "",
            "-C", &key_id,
        ])
        .output()
        .map_err(|e| format!(
            "ssh-keygen failed to run: {}. \
             Make sure OpenSSH is installed (Windows: Settings → Optional features → OpenSSH Client).",
            e
        ))?;

    if !out.status.success() {
        return Err(format!(
            "ssh-keygen error: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let public_key = fs::read_to_string(&pub_path)
        .map_err(|e| format!("Failed to read public key: {}", e))?
        .trim()
        .to_string();

    let _ = fs::remove_file(&pub_path);

    Ok(SshKeypair {
        key_id,
        public_key,
        private_key_path: priv_path
            .to_str()
            .ok_or("Non-UTF-8 temp path")?
            .to_string(),
    })
}

#[tauri::command]
async fn sftp_download(app: tauri::AppHandle, params: TransferParams) -> Result<(), String> {
    do_transfer(app, params, false).await
}

#[tauri::command]
async fn sftp_upload(app: tauri::AppHandle, params: TransferParams) -> Result<(), String> {
    do_transfer(app, params, true).await
}

async fn do_transfer(
    app: tauri::AppHandle,
    params: TransferParams,
    is_upload: bool,
) -> Result<(), String> {
    let username = params.username.as_deref().unwrap_or("ec2-user").to_string();
    let key_path = params.private_key_path.clone();

    let local_port = find_free_port()
        .map_err(|e| format!("Could not find a free local port: {}", e))?;

    let mut tunnel = tokio::process::Command::new("aws")
        .args([
            "ssm", "start-session",
            "--target",        &params.instance_id,
            "--document-name", "AWS-StartPortForwardingSession",
            "--parameters",    &format!(
                r#"{{"portNumber":["22"],"localPortNumber":["{}"]}}"#,
                local_port
            ),
            "--profile", &params.profile,
            "--region",  &params.region,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start SSM tunnel: {}", e))?;

    // Reset the cancel flag for this new transfer
    CANCEL_FLAG.store(false, Ordering::Relaxed);

    let conn = SshConn {
        key_path: key_path.clone(),
        port_str: local_port.to_string(),
        host: format!("{}@127.0.0.1", username),
    };

    let result = async {
        wait_for_port(local_port, 30).await?;
        if is_upload {
            run_upload(&app, &conn, &params.local_path, &params.remote_path).await
        } else {
            run_download(&app, &conn, &params.remote_path, &params.local_path).await
        }
    }
    .await;

    let _ = tunnel.kill().await;
    let _ = fs::remove_file(&key_path);

    result
}

/// Drain a child's stderr in the background to prevent deadlock.
fn drain_stderr(stderr: tokio::process::ChildStderr) -> tokio::task::JoinHandle<String> {
    tokio::spawn(async move {
        let mut s = String::new();
        let _ = tokio::io::BufReader::new(stderr).read_to_string(&mut s).await;
        s
    })
}

/// Wait for an SSH child to exit and return an error if it failed.
async fn wait_child(
    mut child: tokio::process::Child,
    stderr_task: tokio::task::JoinHandle<String>,
    op_name: &str,
) -> Result<(), String> {
    let status = child.wait().await
        .map_err(|e| format!("ssh wait failed: {}", e))?;
    let stderr_str = stderr_task.await.unwrap_or_default();
    if !status.success() {
        return Err(format!(
            "{} failed: {}",
            op_name,
            if stderr_str.trim().is_empty() { "ssh exited with non-zero status".to_string() }
            else { stderr_str.trim().to_string() }
        ));
    }
    Ok(())
}

/// Stream bytes from `reader` to `writer`, emitting sftp-progress events.
/// Checks CANCEL_FLAG each iteration; returns `Err("Transfer cancelled")` if set.
/// Emits a final 100% event on success.
async fn stream_with_progress(
    app: &tauri::AppHandle,
    reader: &mut (impl AsyncReadExt + Unpin),
    writer: &mut (impl AsyncWriteExt + Unpin),
    total_bytes: u64,
) -> Result<u64, String> {
    let mut buf = vec![0u8; 65536];
    let mut transferred: u64 = 0;
    let start = tokio::time::Instant::now();
    let mut last_emit = tokio::time::Instant::now();
    let mut window_bytes: u64 = 0;
    let mut window_start = tokio::time::Instant::now();
    let mut current_rate: f64 = 0.0;

    loop {
        if CANCEL_FLAG.load(Ordering::Relaxed) {
            return Err("Transfer cancelled".to_string());
        }

        let n = reader.read(&mut buf).await
            .map_err(|e| format!("Read error: {}", e))?;
        if n == 0 { break; }

        writer.write_all(&buf[..n]).await
            .map_err(|e| format!("Write error: {}", e))?;

        transferred += n as u64;
        window_bytes += n as u64;

        if window_start.elapsed().as_secs_f64() >= 1.0 {
            current_rate = window_bytes as f64 / window_start.elapsed().as_secs_f64();
            window_bytes = 0;
            window_start = tokio::time::Instant::now();
        }

        if last_emit.elapsed().as_millis() >= 200 {
            let display_rate = if current_rate > 0.0 {
                current_rate
            } else {
                transferred as f64 / start.elapsed().as_secs_f64().max(0.1)
            };
            let percent = if total_bytes > 0 {
                ((transferred * 100) / total_bytes).min(100) as u32
            } else { 0 };
            let _ = app.emit("sftp-progress", TransferProgress {
                percent,
                rate: format_rate(display_rate),
            });
            last_emit = tokio::time::Instant::now();
        }
    }

    let avg = transferred as f64 / start.elapsed().as_secs_f64().max(0.001);
    let _ = app.emit("sftp-progress", TransferProgress { percent: 100, rate: format_rate(avg) });

    Ok(transferred)
}

async fn run_download(
    app: &tauri::AppHandle,
    conn: &SshConn,
    remote_path: &str,
    local_path: &str,
) -> Result<(), String> {
    let quoted = shell_quote(remote_path);

    let size_out = tokio::process::Command::new("ssh")
        .args(conn.base_args())
        .arg(&conn.host)
        .arg(format!("stat -c %s {}", quoted))
        .output().await
        .map_err(|e| format!("ssh stat failed: {}", e))?;
    let total_bytes: u64 = String::from_utf8_lossy(&size_out.stdout)
        .trim().parse().unwrap_or(0);

    let mut child = tokio::process::Command::new("ssh")
        .args(conn.base_args())
        .arg(&conn.host)
        .arg(format!("cat {}", quoted))
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ssh failed to run: {}. Make sure OpenSSH is installed.", e))?;

    let mut stdout = child.stdout.take().ok_or("No stdout handle")?;
    let stderr_task = drain_stderr(child.stderr.take().ok_or("No stderr handle")?);
    let mut local_file = tokio::fs::File::create(local_path).await
        .map_err(|e| format!("Cannot create local file '{}': {}", local_path, e))?;

    let result = stream_with_progress(app, &mut stdout, &mut local_file, total_bytes).await;
    drop(local_file);

    let result = match result {
        Ok(_) => wait_child(child, stderr_task, "Download").await,
        Err(e) => Err(e),
    };
    if result.is_err() {
        let _ = tokio::fs::remove_file(local_path).await;
    }
    result
}

async fn run_upload(
    app: &tauri::AppHandle,
    conn: &SshConn,
    local_path: &str,
    remote_path: &str,
) -> Result<(), String> {
    let quoted = shell_quote(remote_path);

    let total_bytes = tokio::fs::metadata(local_path).await
        .map_err(|e| format!("Cannot stat '{}': {}", local_path, e))?.len();

    let mut child = tokio::process::Command::new("ssh")
        .args(conn.base_args())
        .arg(&conn.host)
        .arg(format!("cat > {}", quoted))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ssh failed to run: {}. Make sure OpenSSH is installed.", e))?;

    let mut stdin = child.stdin.take().ok_or("No stdin handle")?;
    let stderr_task = drain_stderr(child.stderr.take().ok_or("No stderr handle")?);
    let mut local_file = tokio::fs::File::open(local_path).await
        .map_err(|e| format!("Cannot open '{}': {}", local_path, e))?;

    let result = stream_with_progress(app, &mut local_file, &mut stdin, total_bytes).await;
    drop(stdin); // Signal EOF to remote cat

    result?;
    wait_child(child, stderr_task, "Upload").await
}

fn format_rate(bytes_per_sec: f64) -> String {
    if bytes_per_sec >= 1_048_576.0 {
        format!("{:.1} MB/s", bytes_per_sec / 1_048_576.0)
    } else if bytes_per_sec >= 1_024.0 {
        format!("{:.0} KB/s", bytes_per_sec / 1_024.0)
    } else {
        format!("{:.0} B/s", bytes_per_sec)
    }
}

/// Wrap a shell argument in single quotes, escaping any embedded single quotes.
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn find_free_port() -> Result<u16, std::io::Error> {
    use std::net::TcpListener;
    Ok(TcpListener::bind("127.0.0.1:0")?.local_addr()?.port())
}

async fn wait_for_port(port: u16, timeout_secs: u64) -> Result<(), String> {
    let deadline = tokio::time::Instant::now()
        + tokio::time::Duration::from_secs(timeout_secs);

    loop {
        if tokio::net::TcpStream::connect(format!("127.0.0.1:{}", port))
            .await
            .is_ok()
        {
            return Ok(());
        }
        if tokio::time::Instant::now() > deadline {
            return Err(format!(
                "Timed out after {}s waiting for SSH tunnel on port {}. \
                 Verify the instance has SSM agent running and sshd on port 22.",
                timeout_secs, port
            ));
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;
    }
}

// ─── App entry point ──────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_app_config,
            read_aws_files,
            open_ssm_session,
            open_ecs_exec,
            generate_ssh_keypair,
            sftp_download,
            sftp_upload,
            cancel_transfer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
