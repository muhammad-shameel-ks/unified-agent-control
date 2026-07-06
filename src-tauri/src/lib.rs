use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformInfo {
    os: String,
    window_manager: String,
}

#[tauri::command]
fn get_platform_info() -> PlatformInfo {
    let os = std::env::consts::OS.to_string();
    let mut window_manager = "unknown".to_string();

    #[cfg(target_os = "linux")]
    {
        if std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok() {
            window_manager = "hyprland".to_string();
        } else if let Ok(desktop) = std::env::var("XDG_CURRENT_DESKTOP") {
            window_manager = desktop.to_lowercase();
        } else if let Ok(session) = std::env::var("DESKTOP_SESSION") {
            window_manager = session.to_lowercase();
        }
    }

    PlatformInfo { os, window_manager }
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McpConfigEntry {
    #[serde(rename = "type")]
    mcp_type: String,
    url: Option<String>,
    command: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    enabled: Option<bool>,
}

#[derive(Deserialize)]
struct OpenCodeConfigFile {
    mcp: Option<HashMap<String, McpConfigEntry>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeMcpInfo {
    name: String,
    #[serde(rename = "type")]
    mcp_type: String,
    url: Option<String>,
    command: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    enabled: bool,
    source_file: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeSkillInfo {
    id: String,
    name: String,
    description: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeConfigResponse {
    config_dir: String,
    mcp_servers: Vec<OpenCodeMcpInfo>,
    skills: Vec<OpenCodeSkillInfo>,
}

fn clean_jsonc(input: &str) -> String {
    let mut result = String::new();
    let mut in_string = false;
    let mut escape = false;
    let mut in_comment = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if in_comment {
            if c == '\n' {
                in_comment = false;
                result.push('\n');
            }
            continue;
        }

        if escape {
            result.push(c);
            escape = false;
            continue;
        }

        if c == '\\' && in_string {
            result.push(c);
            escape = true;
            continue;
        }

        if c == '"' {
            in_string = !in_string;
            result.push(c);
            continue;
        }

        if !in_string {
            if c == '/' && chars.peek() == Some(&'/') {
                in_comment = true;
                chars.next(); // consume next '/'
                continue;
            }
        }

        result.push(c);
    }

    let mut final_result = String::new();
    let mut chars = result.chars().peekable();
    
    while let Some(c) = chars.next() {
        if c == ',' {
            let mut temp_chars = chars.clone();
            let mut is_trailing = false;
            while let Some(next_c) = temp_chars.next() {
                if next_c.is_whitespace() {
                    continue;
                }
                if next_c == '}' || next_c == ']' {
                    is_trailing = true;
                }
                break;
            }
            if is_trailing {
                continue;
            }
        }
        final_result.push(c);
    }

    final_result
}

fn get_opencode_skills(skills_dir: &str) -> Vec<OpenCodeSkillInfo> {
    let mut skills = Vec::new();
    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().into_owned();
                    let skill_md_path = entry.path().join("SKILL.md");
                    if skill_md_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&skill_md_path) {
                            let mut name = folder_name.clone();
                            let mut description = String::new();
                            
                            if content.starts_with("---") {
                                if let Some(end_fm) = content[3..].find("---") {
                                    let frontmatter = &content[3..3 + end_fm];
                                    let mut in_description = false;
                                    for line in frontmatter.lines() {
                                        let trimmed = line.trim();
                                        if trimmed.starts_with("name:") {
                                            name = trimmed["name:".len()..].trim().trim_matches('"').trim_matches('\'').to_string();
                                            in_description = false;
                                        } else if trimmed.starts_with("description:") {
                                            description = trimmed["description:".len()..].trim().trim_matches('"').trim_matches('\'').to_string();
                                            in_description = true;
                                        } else if in_description && !trimmed.is_empty() {
                                            description.push_str(" ");
                                            description.push_str(trimmed.trim_matches('"').trim_matches('\''));
                                        }
                                    }
                                }
                            }
                            
                            skills.push(OpenCodeSkillInfo {
                                id: folder_name,
                                name,
                                description,
                                path: entry.path().to_string_lossy().into_owned(),
                            });
                        }
                    }
                }
            }
        }
    }
    skills
}

#[tauri::command]
fn get_opencode_config() -> Result<OpenCodeConfigResponse, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let config_dir = format!("{}/.config/opencode", home);
    let mut mcp_servers = Vec::new();

    let json_path = format!("{}/opencode.json", config_dir);
    let jsonc_path = format!("{}/opencode.jsonc", config_dir);

    // Read opencode.json
    if std::path::Path::new(&json_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&json_path) {
            let cleaned = clean_jsonc(&content);
            if let Ok(parsed) = serde_json::from_str::<OpenCodeConfigFile>(&cleaned) {
                if let Some(mcp_map) = parsed.mcp {
                    for (name, entry) in mcp_map {
                        mcp_servers.push(OpenCodeMcpInfo {
                            name,
                            mcp_type: entry.mcp_type,
                            url: entry.url,
                            command: entry.command,
                            env: entry.env,
                            enabled: entry.enabled.unwrap_or(true),
                            source_file: "opencode.json".to_string(),
                        });
                    }
                }
            }
        }
    }

    // Read opencode.jsonc
    if std::path::Path::new(&jsonc_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&jsonc_path) {
            let cleaned = clean_jsonc(&content);
            if let Ok(parsed) = serde_json::from_str::<OpenCodeConfigFile>(&cleaned) {
                if let Some(mcp_map) = parsed.mcp {
                    for (name, entry) in mcp_map {
                        mcp_servers.push(OpenCodeMcpInfo {
                            name,
                            mcp_type: entry.mcp_type,
                            url: entry.url,
                            command: entry.command,
                            env: entry.env,
                            enabled: entry.enabled.unwrap_or(true),
                            source_file: "opencode.jsonc".to_string(),
                        });
                    }
                }
            }
        }
    }

    let skills_dir = format!("{}/skills", config_dir);
    let skills = get_opencode_skills(&skills_dir);

    Ok(OpenCodeConfigResponse {
        config_dir,
        mcp_servers,
        skills,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, get_platform_info, get_opencode_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
