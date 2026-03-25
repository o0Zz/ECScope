use serde::Serialize;
use std::fs;
use std::path::PathBuf;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .invoke_handler(tauri::generate_handler![read_app_config, read_aws_files])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
