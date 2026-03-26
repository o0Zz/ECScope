use serde::Serialize;
use serde::Deserialize;
use std::fs;
use std::process::Command;

#[derive(Serialize)]
struct AwsFiles {
    credentials: String,
    config: String,
}

#[tauri::command]
fn read_app_config() -> Result<String, String> {
    // Try multiple locations for the config file
    let candidates = vec![
        // Next to the executable (production)
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.join("ecscope.config.json"))),
        // Current working directory (development)
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

    Ok(AwsFiles {
        credentials,
        config,
    })
}

#[derive(Deserialize)]
struct SsmConnectParams {
    instance_id: String,
    profile: String,
    region: String,
}

#[derive(Deserialize)]
struct EcsExecParams {
    cluster: String,
    task_id: String,
    container: String,
    profile: String,
    region: String,
}

#[derive(Deserialize)]
struct EcsLogsParams {
    instance_id: String,
    runtime_id: String,
    container_name: String,
    profile: String,
    region: String,
}

#[tauri::command]
fn open_ssm_session(params: SsmConnectParams) -> Result<(), String> {
    let cmd = format!(
        "aws ssm start-session --target {} --profile {} --region {}",
        params.instance_id, params.profile, params.region
    );
    open_in_terminal(&cmd, None)
}

#[tauri::command]
fn open_ecs_exec(params: EcsExecParams) -> Result<(), String> {
    let cmd = format!(
        "aws ecs execute-command --cluster {} --task {} --container {} --interactive --command \"/bin/sh\" --profile {} --region {}",
        params.cluster, params.task_id, params.container, params.profile, params.region
    );
    open_in_terminal(&cmd, None)
}

#[tauri::command]
fn open_ecs_logs(params: EcsLogsParams) -> Result<(), String> {
    let json_params = format!(
        r#"{{"command":["sudo docker logs -f --tail 200 {}"]}}"#,
        params.runtime_id
    );
    let params_path = std::env::temp_dir().join("ecscope_ssm_params.json");
    fs::write(&params_path, &json_params)
        .map_err(|e| format!("Failed to write params file: {}", e))?;
    let params_file_ref = format!("file://{}", params_path.display());

    let cmd = format!(
        "aws ssm start-session --target {} --document-name AWS-StartInteractiveCommand --parameters {} --profile {} --region {}",
        params.instance_id, params_file_ref, params.profile, params.region
    );
    let title = format!("logs: {}", params.container_name);
    open_in_terminal(&cmd, Some(&title))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        .invoke_handler(tauri::generate_handler![read_app_config, read_aws_files, open_ssm_session, open_ecs_exec, open_ecs_logs])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
