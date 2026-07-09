use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_cli::CliExt;

pub mod updater;

static CLI_PATH: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn get_cli_args() -> Result<Option<String>, String> {
    let guard = CLI_PATH.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

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
    tools: Option<HashMap<String, bool>>,
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
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenCodeConfigResponse {
    config_dir: String,
    mcp_servers: Vec<OpenCodeMcpInfo>,
    skills: Vec<OpenCodeSkillInfo>,
    is_symlink: bool,
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

fn get_opencode_skills(skills_dir: &str, disabled_skills: &std::collections::HashSet<String>) -> Vec<OpenCodeSkillInfo> {
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
                            
                            let is_enabled = !disabled_skills.contains(&name.to_lowercase());
                            
                            skills.push(OpenCodeSkillInfo {
                                id: folder_name,
                                name,
                                description,
                                path: entry.path().to_string_lossy().into_owned(),
                                enabled: is_enabled,
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
    let mut disabled_skills = std::collections::HashSet::new();

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
                if let Some(tools_map) = parsed.tools {
                    for (k, v) in tools_map {
                        if k.starts_with("skills_") && !v {
                            disabled_skills.insert(k["skills_".len()..].to_lowercase());
                        }
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
                if let Some(tools_map) = parsed.tools {
                    for (k, v) in tools_map {
                        if k.starts_with("skills_") && !v {
                            disabled_skills.insert(k["skills_".len()..].to_lowercase());
                        }
                    }
                }
            }
        }
    }

    let skills_dir = format!("{}/skills", config_dir);
    let skills = get_opencode_skills(&skills_dir, &disabled_skills);

    let is_symlink = if let Ok(metadata) = std::fs::symlink_metadata(&config_dir) {
        metadata.file_type().is_symlink()
    } else {
        false
    };

    Ok(OpenCodeConfigResponse {
        config_dir,
        mcp_servers,
        skills,
        is_symlink,
    })
}

fn copy_dir_all(src: impl AsRef<std::path::Path>, dst: impl AsRef<std::path::Path>) -> std::io::Result<()> {
    std::fs::create_dir_all(&dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(entry.path(), dst.as_ref().join(entry.file_name()))?;
        } else {
            std::fs::copy(entry.path(), dst.as_ref().join(entry.file_name()))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn migrate_opencode_config() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let old_dir_path = format!("{}/.config/opencode", home);
    let uac_dir_path = format!("{}/.config/uac", home);
    let new_dir_path = format!("{}/.config/uac/opencode-config", home);
    let backup_dir_path = format!("{}/.config/opencode.bak", home);

    let old_dir = std::path::Path::new(&old_dir_path);
    let uac_dir = std::path::Path::new(&uac_dir_path);
    let new_dir = std::path::Path::new(&new_dir_path);
    let backup_dir = std::path::Path::new(&backup_dir_path);

    // 1. Check if old config folder exists
    if !old_dir.exists() {
        return Err("OpenCode config directory does not exist at ~/.config/opencode".to_string());
    }

    // 2. Check if it's already a symlink (avoid double migration)
    if let Ok(metadata) = std::fs::symlink_metadata(old_dir) {
        if metadata.file_type().is_symlink() {
            return Ok("Already migrated and symlinked".to_string());
        }
    }

    // 3. Create ~/.config/uac/ if not exists
    if !uac_dir.exists() {
        std::fs::create_dir_all(uac_dir).map_err(|e| format!("Failed to create ~/.config/uac: {}", e))?;
    }

    // 4. If backup path already exists, clean it or append timestamp
    let final_backup_path = if backup_dir.exists() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}/.config/opencode.bak.{}", home, timestamp)
    } else {
        backup_dir_path.clone()
    };
    let final_backup = std::path::Path::new(&final_backup_path);

    // 5. Copy old directory contents to new directory path (~/.config/uac/opencode-config)
    copy_dir_all(old_dir, new_dir).map_err(|e| format!("Failed to copy config contents: {}", e))?;

    // 6. Rename old directory to backup path
    std::fs::rename(old_dir, final_backup).map_err(|e| format!("Failed to rename old config folder to backup: {}", e))?;

    // 7. Create directory symlink: ~/.config/opencode -> ~/.config/uac/opencode-config
    #[cfg(unix)]
    std::os::unix::fs::symlink(new_dir, old_dir).map_err(|e| format!("Failed to create symlink: {}", e))?;

    Ok(format!("Successfully migrated config to {} and created symlink", new_dir_path))
}

#[tauri::command]
fn toggle_mcp_server(name: String, source_file: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let config_dir = format!("{}/.config/opencode", home);
    let file_path = format!("{}/{}", config_dir, source_file);

    let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    let mut json_val: serde_json::Value = if source_file.ends_with(".jsonc") {
        let cleaned = clean_jsonc(&content);
        serde_json::from_str(&cleaned).map_err(|e| e.to_string())?
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };

    if let Some(mcp) = json_val.get_mut("mcp") {
        if let Some(server) = mcp.get_mut(&name) {
            if let Some(server_obj) = server.as_object_mut() {
                server_obj.insert("enabled".to_string(), serde_json::Value::Bool(enabled));
            }
        }
    }

    // Write back
    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, serialized).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn toggle_skill(name: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let config_dir = format!("{}/.config/opencode", home);
    let file_path = format!("{}/opencode.json", config_dir);

    // Read opencode.json
    let content = if std::path::Path::new(&file_path).exists() {
        std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json_val: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Get or create "tools" object
    if json_val.get("tools").is_none() {
        json_val["tools"] = serde_json::Value::Object(serde_json::Map::new());
    }

    if let Some(tools) = json_val.get_mut("tools") {
        if let Some(tools_obj) = tools.as_object_mut() {
            let key = format!("skills_{}", name);
            tools_obj.insert(key, serde_json::Value::Bool(enabled));
        }
    }

    // Write back
    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&file_path, serialized).map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCodeConfigResponse {
    config_dir: String,
    mcp_servers: Vec<ClaudeCodeMcpInfo>,
    skills: Vec<ClaudeCodeSkillInfo>,
    is_symlink: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeCodeMcpInfo {
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
struct ClaudeCodeSkillInfo {
    id: String,
    name: String,
    description: String,
    path: String,
    enabled: bool,
}

#[derive(Deserialize)]
struct ClaudeConfigFile {
    #[serde(rename = "mcpServers")]
    mcp_servers: Option<HashMap<String, ClaudeMcpEntry>>,
    projects: Option<HashMap<String, ClaudeProjectEntry>>,
}

#[derive(Deserialize)]
struct ClaudeProjectEntry {
    #[serde(rename = "mcpServers")]
    mcp_servers: Option<HashMap<String, ClaudeMcpEntry>>,
}

#[derive(Deserialize, Clone)]
struct ClaudeMcpEntry {
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    disabled: Option<bool>,
}

fn get_claudecode_skills(skills_dir: &str) -> Vec<ClaudeCodeSkillInfo> {
    let mut skills = Vec::new();
    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().into_owned();
                    let is_disabled = folder_name.ends_with(".disabled");
                    let clean_id = if is_disabled {
                        folder_name[..folder_name.len() - ".disabled".len()].to_string()
                    } else {
                        folder_name.clone()
                    };

                    let skill_md_path = entry.path().join("SKILL.md");
                    if skill_md_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&skill_md_path) {
                            let mut name = clean_id.clone();
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
                            
                            skills.push(ClaudeCodeSkillInfo {
                                id: clean_id,
                                name,
                                description,
                                path: entry.path().to_string_lossy().into_owned(),
                                enabled: !is_disabled,
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
fn get_claudecode_config() -> Result<ClaudeCodeConfigResponse, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let config_dir = format!("{}/.claude", home);
    let claude_json_path = format!("{}/.claude.json", home);
    let mut mcp_servers = Vec::new();

    // Read ~/.claude.json
    if std::path::Path::new(&claude_json_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&claude_json_path) {
            if let Ok(parsed) = serde_json::from_str::<ClaudeConfigFile>(&content) {
                // 1. User-scoped global MCP servers
                if let Some(mcp_map) = parsed.mcp_servers {
                    for (name, entry) in mcp_map {
                        let mut command_args = Vec::new();
                        if let Some(cmd) = entry.command {
                            command_args.push(cmd);
                        }
                        if let Some(args) = entry.args {
                            command_args.extend(args);
                        }
                        mcp_servers.push(ClaudeCodeMcpInfo {
                            name,
                            mcp_type: "command".to_string(),
                            url: None,
                            command: Some(command_args),
                            env: entry.env,
                            enabled: !entry.disabled.unwrap_or(false),
                            source_file: ".claude.json (User)".to_string(),
                        });
                    }
                }
                // 2. Project-scoped MCP servers
                if let Some(projects_map) = parsed.projects {
                    let proj_path = format!("{}/Dev/applications/desktop/unified-agent-control", home);
                    if let Some(proj) = projects_map.get(&proj_path) {
                        if let Some(mcp_map) = &proj.mcp_servers {
                            for (name, entry) in mcp_map {
                                let mut command_args = Vec::new();
                                if let Some(cmd) = &entry.command {
                                    command_args.push(cmd.clone());
                                }
                                if let Some(args) = &entry.args {
                                    command_args.extend(args.clone());
                                }
                                mcp_servers.push(ClaudeCodeMcpInfo {
                                    name: name.clone(),
                                    mcp_type: "command".to_string(),
                                    url: None,
                                    command: Some(command_args),
                                    env: entry.env.clone(),
                                    enabled: !entry.disabled.unwrap_or(false),
                                    source_file: ".claude.json (Project)".to_string()
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    let skills_dir = format!("{}/skills", config_dir);
    let skills = get_claudecode_skills(&skills_dir);

    let is_symlink = if let Ok(metadata) = std::fs::symlink_metadata(&config_dir) {
        metadata.file_type().is_symlink()
    } else {
        false
    };

    Ok(ClaudeCodeConfigResponse {
        config_dir,
        mcp_servers,
        skills,
        is_symlink,
    })
}

#[tauri::command]
fn migrate_claudecode_config() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let old_dir_path = format!("{}/.claude", home);
    let uac_dir_path = format!("{}/.config/uac", home);
    let new_dir_path = format!("{}/.config/uac/claude-config", home);
    let backup_dir_path = format!("{}/.claude.bak", home);

    let old_dir = std::path::Path::new(&old_dir_path);
    let uac_dir = std::path::Path::new(&uac_dir_path);
    let new_dir = std::path::Path::new(&new_dir_path);
    let backup_dir = std::path::Path::new(&backup_dir_path);

    // 1. Check if old config folder exists
    if !old_dir.exists() {
        std::fs::create_dir_all(new_dir).map_err(|e| format!("Failed to create UAC folder: {}", e))?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(new_dir, old_dir).map_err(|e| format!("Failed to create symlink: {}", e))?;
        return Ok("Created new config directory and symlinked".to_string());
    }

    // 2. Check if it's already a symlink
    if let Ok(metadata) = std::fs::symlink_metadata(old_dir) {
        if metadata.file_type().is_symlink() {
            return Ok("Already migrated and symlinked".to_string());
        }
    }

    // 3. Create ~/.config/uac/ if not exists
    if !uac_dir.exists() {
        std::fs::create_dir_all(uac_dir).map_err(|e| format!("Failed to create ~/.config/uac: {}", e))?;
    }

    // 4. Handle backup
    let final_backup_path = if backup_dir.exists() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}/.claude.bak.{}", home, timestamp)
    } else {
        backup_dir_path.clone()
    };
    let final_backup = std::path::Path::new(&final_backup_path);

    // 5. Copy old folder to new path
    copy_dir_all(old_dir, new_dir).map_err(|e| format!("Failed to copy Claude Code configs: {}", e))?;

    // 6. Rename old to backup
    std::fs::rename(old_dir, final_backup).map_err(|e| format!("Failed to backup Claude Code configs: {}", e))?;

    // 7. Symlink
    #[cfg(unix)]
    std::os::unix::fs::symlink(new_dir, old_dir).map_err(|e| format!("Failed to create symlink: {}", e))?;

    Ok(format!("Successfully migrated config to {} and created symlink", new_dir_path))
}

#[tauri::command]
fn toggle_claudecode_mcp_server(name: String, source_file: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let claude_json_path = format!("{}/.claude.json", home);

    let content = std::fs::read_to_string(&claude_json_path).map_err(|e| e.to_string())?;
    let mut json_val: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    if source_file.contains("User") {
        if let Some(mcp) = json_val.get_mut("mcpServers") {
            if let Some(server) = mcp.get_mut(&name) {
                if let Some(server_obj) = server.as_object_mut() {
                    server_obj.insert("disabled".to_string(), serde_json::Value::Bool(!enabled));
                }
            }
        }
    } else if source_file.contains("Project") {
        let proj_path = format!("{}/Dev/applications/desktop/unified-agent-control", home);
        if let Some(projects) = json_val.get_mut("projects") {
            if let Some(proj) = projects.get_mut(&proj_path) {
                if let Some(mcp) = proj.get_mut("mcpServers") {
                    if let Some(server) = mcp.get_mut(&name) {
                        if let Some(server_obj) = server.as_object_mut() {
                            server_obj.insert("disabled".to_string(), serde_json::Value::Bool(!enabled));
                        }
                    }
                }
            }
        }
    }

    // Write back
    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&claude_json_path, serialized).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn toggle_claudecode_skill(id: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let skills_dir = format!("{}/.claude/skills", home);

    let current_path = if enabled {
        format!("{}/{}.disabled", skills_dir, id)
    } else {
        format!("{}/{}", skills_dir, id)
    };

    let target_path = if enabled {
        format!("{}/{}", skills_dir, id)
    } else {
        format!("{}/{}.disabled", skills_dir, id)
    };

    let current = std::path::Path::new(&current_path);
    let target = std::path::Path::new(&target_path);

    if current.exists() {
        std::fs::rename(current, target).map_err(|e| format!("Failed to rename skill folder: {}", e))?;
    }

    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgyConfigResponse {
    config_dir: String,
    mcp_servers: Vec<AgyMcpInfo>,
    skills: Vec<AgySkillInfo>,
    is_symlink: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgyMcpInfo {
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
struct AgySkillInfo {
    id: String,
    name: String,
    description: String,
    path: String,
    enabled: bool,
}

#[derive(Deserialize)]
struct AgyMcpConfig {
    #[serde(rename = "mcpServers")]
    mcp_servers: Option<HashMap<String, AgyMcpEntry>>,
}

#[derive(Deserialize, Clone)]
struct AgyMcpEntry {
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    enabled: Option<bool>,
    #[serde(rename = "serverUrl")]
    server_url: Option<String>,
    #[allow(dead_code)]
    headers: Option<serde_json::Value>,
}

fn get_agy_skills(skills_dir: &str) -> Vec<AgySkillInfo> {
    let mut skills = Vec::new();
    if let Ok(entries) = std::fs::read_dir(skills_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().into_owned();
                    let is_disabled = folder_name.ends_with(".disabled");
                    let clean_id = if is_disabled {
                        folder_name[..folder_name.len() - ".disabled".len()].to_string()
                    } else {
                        folder_name.clone()
                    };

                    let skill_md_path = entry.path().join("SKILL.md");
                    if skill_md_path.exists() {
                        if let Ok(content) = std::fs::read_to_string(&skill_md_path) {
                            let mut name = clean_id.clone();
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
                            
                            skills.push(AgySkillInfo {
                                id: clean_id,
                                name,
                                description,
                                path: entry.path().to_string_lossy().into_owned(),
                                enabled: !is_disabled,
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
fn get_agy_config() -> Result<AgyConfigResponse, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let config_dir = format!("{}/.gemini/config", home);
    let mcp_json_path = format!("{}/mcp_config.json", config_dir);
    let mut mcp_servers = Vec::new();

    // Read mcp_config.json
    if std::path::Path::new(&mcp_json_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&mcp_json_path) {
            if !content.trim().is_empty() {
                if let Ok(parsed) = serde_json::from_str::<AgyMcpConfig>(&content) {
                    if let Some(mcp_map) = parsed.mcp_servers {
                        for (name, entry) in mcp_map {
                            if let Some(server_url) = entry.server_url.clone() {
                                mcp_servers.push(AgyMcpInfo {
                                    name,
                                    mcp_type: "remote".to_string(),
                                    url: Some(server_url),
                                    command: None,
                                    env: entry.env,
                                    enabled: entry.enabled.unwrap_or(true),
                                    source_file: "mcp_config.json".to_string(),
                                });
                            } else {
                                let mut command_args = Vec::new();
                                if let Some(cmd) = entry.command {
                                    command_args.push(cmd);
                                }
                                if let Some(args) = entry.args {
                                    command_args.extend(args);
                                }
                                mcp_servers.push(AgyMcpInfo {
                                    name,
                                    mcp_type: "command".to_string(),
                                    url: None,
                                    command: Some(command_args),
                                    env: entry.env,
                                    enabled: entry.enabled.unwrap_or(true),
                                    source_file: "mcp_config.json".to_string(),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    let skills_dir = format!("{}/skills", config_dir);
    let skills = get_agy_skills(&skills_dir);

    let is_symlink = if let Ok(metadata) = std::fs::symlink_metadata(&config_dir) {
        metadata.file_type().is_symlink()
    } else {
        false
    };

    Ok(AgyConfigResponse {
        config_dir,
        mcp_servers,
        skills,
        is_symlink,
    })
}

#[tauri::command]
fn migrate_agy_config() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let old_dir_path = format!("{}/.gemini/config", home);
    let uac_dir_path = format!("{}/.config/uac", home);
    let new_dir_path = format!("{}/.config/uac/gemini-config", home);
    let backup_dir_path = format!("{}/.gemini/config.bak", home);

    let old_dir = std::path::Path::new(&old_dir_path);
    let uac_dir = std::path::Path::new(&uac_dir_path);
    let new_dir = std::path::Path::new(&new_dir_path);
    let backup_dir = std::path::Path::new(&backup_dir_path);

    // 1. Check if old config folder exists
    if !old_dir.exists() {
        std::fs::create_dir_all(new_dir).map_err(|e| format!("Failed to create UAC folder: {}", e))?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(new_dir, old_dir).map_err(|e| format!("Failed to create symlink: {}", e))?;
        return Ok("Created new config directory and symlinked".to_string());
    }

    // 2. Check if it's already a symlink
    if let Ok(metadata) = std::fs::symlink_metadata(old_dir) {
        if metadata.file_type().is_symlink() {
            return Ok("Already migrated and symlinked".to_string());
        }
    }

    // 3. Create ~/.config/uac/ if not exists
    if !uac_dir.exists() {
        std::fs::create_dir_all(uac_dir).map_err(|e| format!("Failed to create ~/.config/uac: {}", e))?;
    }

    // 4. Handle backup
    let final_backup_path = if backup_dir.exists() {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        format!("{}/.gemini/config.bak.{}", home, timestamp)
    } else {
        backup_dir_path.clone()
    };
    let final_backup = std::path::Path::new(&final_backup_path);

    // 5. Copy old folder to new path
    copy_dir_all(old_dir, new_dir).map_err(|e| format!("Failed to copy Gemini configs: {}", e))?;

    // 6. Rename old to backup
    std::fs::rename(old_dir, final_backup).map_err(|e| format!("Failed to backup Gemini configs: {}", e))?;

    // 7. Symlink
    #[cfg(unix)]
    std::os::unix::fs::symlink(new_dir, old_dir).map_err(|e| format!("Failed to create symlink: {}", e))?;

    Ok(format!("Successfully migrated config to {} and created symlink", new_dir_path))
}

#[tauri::command]
fn toggle_agy_mcp_server(name: String, source_file: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let mcp_json_path = format!("{}/.gemini/config/{}", home, source_file);

    // Read mcp_config.json
    let content = if std::path::Path::new(&mcp_json_path).exists() {
        std::fs::read_to_string(&mcp_json_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json_val: serde_json::Value = if content.trim().is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };

    // Ensure mcpServers exists
    if json_val.get("mcpServers").is_none() {
        json_val["mcpServers"] = serde_json::Value::Object(serde_json::Map::new());
    }

    if let Some(mcp) = json_val.get_mut("mcpServers") {
        if let Some(server) = mcp.get_mut(&name) {
            if let Some(server_obj) = server.as_object_mut() {
                server_obj.insert("enabled".to_string(), serde_json::Value::Bool(enabled));
            }
        }
    }

    // Write back
    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&mcp_json_path, serialized).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn toggle_agy_skill(id: String, enabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let skills_dir = format!("{}/.gemini/config/skills", home);

    let current_path = if enabled {
        format!("{}/{}.disabled", skills_dir, id)
    } else {
        format!("{}/{}", skills_dir, id)
    };

    let target_path = if enabled {
        format!("{}/{}", skills_dir, id)
    } else {
        format!("{}/{}.disabled", skills_dir, id)
    };

    let current = std::path::Path::new(&current_path);
    let target = std::path::Path::new(&target_path);

    if current.exists() {
        std::fs::rename(current, target).map_err(|e| format!("Failed to rename skill folder: {}", e))?;
    }

    Ok(())
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ShareMcpPayload {
    name: String,
    #[serde(rename = "type")]
    mcp_type: Option<String>,
    url: Option<String>,
    command: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    headers: Option<serde_json::Value>,
    enabled: bool,
}

fn add_or_remove_opencode_mcp(file_path: &str, name: &str, payload: &Option<ShareMcpPayload>, remove: bool) -> Result<(), String> {
    let opencode_json_path = file_path.to_string();

    let content = if std::path::Path::new(&opencode_json_path).exists() {
        std::fs::read_to_string(&opencode_json_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json_val: serde_json::Value = if content.trim().is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };

    if json_val.get("mcp").is_none() {
        json_val["mcp"] = serde_json::Value::Object(serde_json::Map::new());
    }

    if let Some(mcp) = json_val.get_mut("mcp") {
        if let Some(mcp_obj) = mcp.as_object_mut() {
            if remove {
                mcp_obj.remove(name);
            } else if let Some(p) = payload {
                let mut server_obj = serde_json::Map::new();
                if let Some(ref url) = p.url {
                    server_obj.insert("type".to_string(), serde_json::Value::String("remote".to_string()));
                    server_obj.insert("url".to_string(), serde_json::Value::String(url.clone()));
                    if let Some(ref headers) = p.headers {
                        server_obj.insert("headers".to_string(), headers.clone());
                    }
                } else {
                    server_obj.insert("type".to_string(), serde_json::Value::String("command".to_string()));
                    if let Some(ref cmd) = p.command {
                        server_obj.insert("command".to_string(), serde_json::to_value(cmd).unwrap_or(serde_json::Value::Null));
                    }
                }
                if let Some(ref env) = p.env {
                    server_obj.insert("env".to_string(), env.clone());
                }
                server_obj.insert("enabled".to_string(), serde_json::Value::Bool(p.enabled));
                mcp_obj.insert(name.to_string(), serde_json::Value::Object(server_obj));
            }
        }
    }

    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&opencode_json_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

fn add_or_remove_claudecode_mcp(file_path: &str, name: &str, payload: &Option<ShareMcpPayload>, remove: bool) -> Result<(), String> {
    let claude_json_path = file_path.to_string();

    let content = if std::path::Path::new(&claude_json_path).exists() {
        std::fs::read_to_string(&claude_json_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json_val: serde_json::Value = if content.trim().is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };

    if json_val.get("mcpServers").is_none() {
        json_val["mcpServers"] = serde_json::Value::Object(serde_json::Map::new());
    }

    if let Some(mcp) = json_val.get_mut("mcpServers") {
        if let Some(mcp_obj) = mcp.as_object_mut() {
            if remove {
                mcp_obj.remove(name);
            } else if let Some(p) = payload {
                let mut server_obj = serde_json::Map::new();
                if let Some(ref cmd_arr) = p.command {
                    if !cmd_arr.is_empty() {
                        server_obj.insert("command".to_string(), serde_json::Value::String(cmd_arr[0].clone()));
                        let args: Vec<String> = cmd_arr[1..].to_vec();
                        server_obj.insert("args".to_string(), serde_json::to_value(args).unwrap_or(serde_json::Value::Null));
                    }
                }
                if let Some(ref env) = p.env {
                    server_obj.insert("env".to_string(), env.clone());
                }
                server_obj.insert("disabled".to_string(), serde_json::Value::Bool(!p.enabled));
                mcp_obj.insert(name.to_string(), serde_json::Value::Object(server_obj));
            }
        }
    }

    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&claude_json_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

fn add_or_remove_agy_mcp(file_path: &str, name: &str, payload: &Option<ShareMcpPayload>, remove: bool) -> Result<(), String> {
    let mcp_json_path = file_path.to_string();

    let content = if std::path::Path::new(&mcp_json_path).exists() {
        std::fs::read_to_string(&mcp_json_path).map_err(|e| e.to_string())?
    } else {
        "{}".to_string()
    };

    let mut json_val: serde_json::Value = if content.trim().is_empty() {
        serde_json::Value::Object(serde_json::Map::new())
    } else {
        serde_json::from_str(&content).map_err(|e| e.to_string())?
    };

    if json_val.get("mcpServers").is_none() {
        json_val["mcpServers"] = serde_json::Value::Object(serde_json::Map::new());
    }

    if let Some(mcp) = json_val.get_mut("mcpServers") {
        if let Some(mcp_obj) = mcp.as_object_mut() {
            if remove {
                mcp_obj.remove(name);
            } else if let Some(p) = payload {
                let mut server_obj = serde_json::Map::new();
                if let Some(ref url) = p.url {
                    server_obj.insert("serverUrl".to_string(), serde_json::Value::String(url.clone()));
                    if let Some(ref headers) = p.headers {
                        server_obj.insert("headers".to_string(), headers.clone());
                    }
                } else if let Some(ref cmd_arr) = p.command {
                    if !cmd_arr.is_empty() {
                        server_obj.insert("command".to_string(), serde_json::Value::String(cmd_arr[0].clone()));
                        let args: Vec<String> = cmd_arr[1..].to_vec();
                        server_obj.insert("args".to_string(), serde_json::to_value(args).unwrap_or(serde_json::Value::Null));
                    }
                }
                if let Some(ref env) = p.env {
                    server_obj.insert("env".to_string(), env.clone());
                }
                server_obj.insert("enabled".to_string(), serde_json::Value::Bool(p.enabled));
                mcp_obj.insert(name.to_string(), serde_json::Value::Object(server_obj));
            }
        }
    }

    let serialized = serde_json::to_string_pretty(&json_val).map_err(|e| e.to_string())?;
    std::fs::write(&mcp_json_path, serialized).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn share_mcp_server(source_agent: String, payload: ShareMcpPayload, share: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let oc_path = format!("{}/.config/opencode/opencode.json", home);
    let cc_path = format!("{}/.claude.json", home);
    let agy_path = format!("{}/.gemini/config/mcp_config.json", home);
    let name = payload.name.clone();
    if share {
        if source_agent != "OpenCode" {
            add_or_remove_opencode_mcp(&oc_path, &name, &Some(payload.clone()), false)?;
        }
        if source_agent != "ClaudeCode" {
            add_or_remove_claudecode_mcp(&cc_path, &name, &Some(payload.clone()), false)?;
        }
        if source_agent != "AGY" {
            add_or_remove_agy_mcp(&agy_path, &name, &Some(payload.clone()), false)?;
        }
    } else {
        if source_agent != "OpenCode" {
            add_or_remove_opencode_mcp(&oc_path, &name, &None, true)?;
        }
        if source_agent != "ClaudeCode" {
            add_or_remove_claudecode_mcp(&cc_path, &name, &None, true)?;
        }
        if source_agent != "AGY" {
            add_or_remove_agy_mcp(&agy_path, &name, &None, true)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn register_mcp_on_agent(agent_id: String, payload: ShareMcpPayload, register: bool) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    let oc_path = format!("{}/.config/opencode/opencode.json", home);
    let cc_path = format!("{}/.claude.json", home);
    let agy_path = format!("{}/.gemini/config/mcp_config.json", home);
    let name = payload.name.clone();
    if register {
        if agent_id == "OpenCode" {
            add_or_remove_opencode_mcp(&oc_path, &name, &Some(payload), false)?;
        } else if agent_id == "ClaudeCode" {
            add_or_remove_claudecode_mcp(&cc_path, &name, &Some(payload), false)?;
        } else if agent_id == "AGY" {
            add_or_remove_agy_mcp(&agy_path, &name, &Some(payload), false)?;
        }
    } else {
        if agent_id == "OpenCode" {
            add_or_remove_opencode_mcp(&oc_path, &name, &None, true)?;
        } else if agent_id == "ClaudeCode" {
            add_or_remove_claudecode_mcp(&cc_path, &name, &None, true)?;
        } else if agent_id == "AGY" {
            add_or_remove_agy_mcp(&agy_path, &name, &None, true)?;
        }
    }
    Ok(())
}

// ====================== PROJECT-LEVEL UNIFICATION ======================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfigResponse {
    project_root: String,
    is_adopted: bool,
    uac_skills_dir: String,
    mcp_servers: Vec<ProjectMcpEntry>,
    skills: Vec<ProjectSkillEntry>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectMcpEntry {
    name: String,
    #[serde(rename = "type")]
    mcp_type: String,
    url: Option<String>,
    command: Option<Vec<String>>,
    env: Option<serde_json::Value>,
    enabled: bool,
    agents: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSkillEntry {
    id: String,
    name: String,
    description: String,
    path: String,
    enabled: bool,
}

#[tauri::command]
fn get_project_config(project_root: String) -> Result<ProjectConfigResponse, String> {
    let uac_skills_dir = format!("{}/.uac/skills", project_root);
    let is_adopted = std::path::Path::new(&uac_skills_dir).exists();
    let mut mcp_servers: std::collections::HashMap<String, ProjectMcpEntry> = std::collections::HashMap::new();

    // ── OpenCode ──────────────────────────────────────────────────────
    let oc_json = format!("{}/.opencode/opencode.json", project_root);
    let oc_jsonc = format!("{}/.opencode/opencode.jsonc", project_root);
    for path in [&oc_json, &oc_jsonc] {
        if std::path::Path::new(path).exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let cleaned = clean_jsonc(&content);
                if let Ok(parsed) = serde_json::from_str::<OpenCodeConfigFile>(&cleaned) {
                    if let Some(mcp_map) = parsed.mcp {
                        for (name, entry) in mcp_map {
                            let cmd = entry.command.map(|v| {
                                if v.iter().all(|s| !s.starts_with('-')) { v }
                                else { vec![] }
                            });
                            let url = if cmd.as_ref().map_or(true, |c| c.is_empty()) {
                                entry.url
                            } else {
                                None
                            };
                            let mcp_type = if url.is_some() { "remote".to_string() } else { "command".to_string() };
                            let e = mcp_servers.entry(name.clone()).or_insert_with(|| ProjectMcpEntry {
                                name: name.clone(), mcp_type, url, command: cmd, env: entry.env,
                                enabled: entry.enabled.unwrap_or(true), agents: Vec::new(),
                            });
                            if !e.agents.contains(&"OpenCode".to_string()) { e.agents.push("OpenCode".into()); }
                        }
                    }
                }
            }
        }
    }

    // ── Claude Code (.mcp.json at project root) ───────────────────────
    let cc_path = format!("{}/.mcp.json", project_root);
    if std::path::Path::new(&cc_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&cc_path) {
            if let Ok(parsed) = serde_json::from_str::<ClaudeConfigFile>(&content) {
                if let Some(mcp_map) = parsed.mcp_servers {
                    for (name, entry) in mcp_map {
                        let mut cmd = Vec::new();
                        let mcp_type = if entry.command.is_some() { "command".to_string() } else { "remote".to_string() };
                        if let Some(c) = entry.command { cmd.push(c); }
                        if let Some(args) = entry.args { cmd.extend(args); }
                        let e = mcp_servers.entry(name.clone()).or_insert_with(|| ProjectMcpEntry {
                            name: name.clone(), mcp_type, url: None, command: Some(cmd), env: entry.env,
                            enabled: !entry.disabled.unwrap_or(false), agents: Vec::new(),
                        });
                        if !e.agents.contains(&"ClaudeCode".to_string()) { e.agents.push("ClaudeCode".into()); }
                    }
                }
            }
        }
    }

    // ── AGY / Antigravity (.agents/mcp_config.json) ───────────────────
    let agy_path = format!("{}/.agents/mcp_config.json", project_root);
    if std::path::Path::new(&agy_path).exists() {
        if let Ok(content) = std::fs::read_to_string(&agy_path) {
            if !content.trim().is_empty() {
                if let Ok(parsed) = serde_json::from_str::<AgyMcpConfig>(&content) {
                    if let Some(mcp_map) = parsed.mcp_servers {
                        for (name, entry) in mcp_map {
                            let mut cmd = Vec::new();
                            if let Some(c) = entry.command { cmd.push(c); }
                            if let Some(args) = entry.args { cmd.extend(args); }
                            let url = entry.server_url;
                            let mcp_type = if url.is_some() { "remote".to_string() } else { "command".to_string() };
                            let e = mcp_servers.entry(name.clone()).or_insert_with(|| ProjectMcpEntry {
                                name: name.clone(), mcp_type, url, command: Some(cmd), env: entry.env,
                                enabled: entry.enabled.unwrap_or(true), agents: Vec::new(),
                            });
                            if !e.agents.contains(&"AGY".to_string()) { e.agents.push("AGY".into()); }
                        }
                    }
                }
            }
        }
    }

    // ── Skills (scan .uac/skills/) ────────────────────────────────────
    let skills = if is_adopted { get_opencode_skills(&uac_skills_dir, &std::collections::HashSet::new()) }
                else { Vec::new() };
    let project_skills: Vec<ProjectSkillEntry> = skills.into_iter().map(|s| ProjectSkillEntry {
        id: s.id, name: s.name, description: s.description, path: s.path, enabled: s.enabled,
    }).collect();

    let mut servers: Vec<ProjectMcpEntry> = mcp_servers.into_values().collect();
    servers.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(ProjectConfigResponse { project_root, is_adopted, uac_skills_dir, mcp_servers: servers, skills: project_skills })
}

#[tauri::command]
fn adopt_project(project_root: String) -> Result<String, String> {
    let root = std::path::Path::new(&project_root);
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".into());
    }

    let uac_dir = root.join(".uac");
    let uac_skills_dir = uac_dir.join("skills");
    std::fs::create_dir_all(&uac_skills_dir).map_err(|e| format!("Failed to create .uac/skills: {}", e))?;

    // ── Migrate existing skills into .uac/skills/ ────────────────────
    let agent_skills_dirs = [
        root.join(".opencode").join("skills"),
        root.join(".claude").join("skills"),
        root.join(".agents").join("skills"),
    ];
    for dir in &agent_skills_dirs {
        if dir.exists() && !std::fs::symlink_metadata(dir).map_or(false, |m| m.file_type().is_symlink()) {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map_or(false, |ft| ft.is_dir()) {
                        let folder_name = entry.file_name().to_string_lossy().into_owned();
                        let target = uac_skills_dir.join(&folder_name);
                        if !target.exists() {
                            let _ = std::fs::rename(entry.path(), &target);
                        }
                    }
                }
            }
        }
    }

    // ── Create / reassert symlinks ───────────────────────────────────
    for dir in &agent_skills_dirs {
        if dir.exists() || dir.symlink_metadata().is_ok() {
            let _ = std::fs::remove_dir_all(dir);
        }
        if !dir.exists() {
            let parent = dir.parent().unwrap_or(root);
            let _ = std::fs::create_dir_all(parent);
            #[cfg(unix)]
            std::os::unix::fs::symlink("../.uac/skills", dir)
                .map_err(|e| format!("Symlink warning {}: {}", dir.display(), e))?;
        }
    }

    // ── Deduplicate MCP entries across all three project files ────────
    let mut aggregated: std::collections::HashMap<String, serde_json::Value> = std::collections::HashMap::new();

    // Read OpenCode project MCP
    let oc_json = root.join(".opencode/opencode.json");
    if oc_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&oc_json) {
            let cleaned = clean_jsonc(&content);
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&cleaned) {
                if let Some(mcp_map) = json_val.get_mut("mcp").and_then(|v| v.as_object_mut()) {
                    for (name, val) in mcp_map.iter() {
                        aggregated.entry(name.clone()).or_insert_with(|| val.clone());
                    }
                }
            }
        }
    }

    // Read Claude project MCP
    let cc_json = root.join(".mcp.json");
    if cc_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&cc_json) {
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_map) = json_val.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                    for (name, val) in mcp_map.iter() {
                        aggregated.entry(name.clone()).or_insert_with(|| val.clone());
                    }
                }
            }
        }
    }

    // Read AGY project MCP
    let agy_json = root.join(".agents/mcp_config.json");
    if agy_json.exists() {
        if let Ok(content) = std::fs::read_to_string(&agy_json) {
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(mcp_map) = json_val.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
                    for (name, val) in mcp_map.iter() {
                        aggregated.entry(name.clone()).or_insert_with(|| val.clone());
                    }
                }
            }
        }
    }

    // ── Write deduplicated MCP entries to all three files ─────────────
    for (name, entry) in &aggregated {
        let _ = add_or_remove_opencode_mcp(&oc_json.to_string_lossy(), name, &Some(ShareMcpPayload {
            name: name.clone(), mcp_type: None, url: entry.get("url").and_then(|v| v.as_str()).map(String::from),
            command: entry.get("command").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            env: entry.get("env").cloned(), headers: entry.get("headers").cloned(),
            enabled: entry.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
        }), false);
        let _ = add_or_remove_claudecode_mcp(&cc_json.to_string_lossy(), name, &Some(ShareMcpPayload {
            name: name.clone(), mcp_type: None, url: entry.get("url").and_then(|v| v.as_str()).map(String::from),
            command: entry.get("command").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            env: entry.get("env").cloned(), headers: entry.get("headers").cloned(),
            enabled: entry.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
        }), false);
        let _ = add_or_remove_agy_mcp(&agy_json.to_string_lossy(), name, &Some(ShareMcpPayload {
            name: name.clone(), mcp_type: None, url: entry.get("url").and_then(|v| v.as_str()).map(String::from),
            command: entry.get("command").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()),
            env: entry.get("env").cloned(), headers: entry.get("headers").cloned(),
            enabled: entry.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
        }), false);
    }

    // ── Gitignore the three symlinks ──────────────────────────────────
    let gitignore_path = root.join(".gitignore");
    let mut gitignore_lines = if gitignore_path.exists() {
        std::fs::read_to_string(&gitignore_path).unwrap_or_default()
    } else { String::new() };
    let symlinks_to_ignore = [".opencode/skills", ".claude/skills", ".agents/skills"];
    for s in &symlinks_to_ignore {
        if !gitignore_lines.contains(s) {
            if !gitignore_lines.ends_with('\n') && !gitignore_lines.is_empty() {
                gitignore_lines.push('\n');
            }
            gitignore_lines.push_str(s);
            gitignore_lines.push('\n');
        }
    }
    if !gitignore_lines.is_empty() {
        let _ = std::fs::write(&gitignore_path, gitignore_lines);
    }

    Ok(format!("Project adopted: .uac/skills created, 3 symlinks placed, {} MCP server(s) unified", aggregated.len()))
}

#[tauri::command]
fn upsert_project_mcp(project_root: String, payload: ShareMcpPayload) -> Result<(), String> {
    let name = payload.name.clone();
    let oc_path = format!("{}/.opencode/opencode.json", project_root);
    let cc_path = format!("{}/.mcp.json", project_root);
    let agy_path = format!("{}/.agents/mcp_config.json", project_root);
    add_or_remove_opencode_mcp(&oc_path, &name, &Some(payload.clone()), false)?;
    add_or_remove_claudecode_mcp(&cc_path, &name, &Some(payload.clone()), false)?;
    add_or_remove_agy_mcp(&agy_path, &name, &Some(payload), false)?;
    Ok(())
}

#[tauri::command]
fn remove_project_mcp(project_root: String, name: String) -> Result<(), String> {
    let oc_path = format!("{}/.opencode/opencode.json", project_root);
    let cc_path = format!("{}/.mcp.json", project_root);
    let agy_path = format!("{}/.agents/mcp_config.json", project_root);
    add_or_remove_opencode_mcp(&oc_path, &name, &None, true)?;
    add_or_remove_claudecode_mcp(&cc_path, &name, &None, true)?;
    add_or_remove_agy_mcp(&agy_path, &name, &None, true)?;
    Ok(())
}

#[tauri::command]
fn toggle_project_skill(project_root: String, id: String, enabled: bool) -> Result<(), String> {
    let skills_dir = format!("{}/.uac/skills", project_root);
    let current_path = if enabled { format!("{}/{}.disabled", skills_dir, id) } else { format!("{}/{}", skills_dir, id) };
    let target_path = if enabled { format!("{}/{}", skills_dir, id) } else { format!("{}/{}.disabled", skills_dir, id) };
    if std::path::Path::new(&current_path).exists() {
        std::fs::rename(&current_path, &target_path).map_err(|e| format!("Failed to rename skill folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn create_project_skill(project_root: String, id: String, name: String, description: String, body: String) -> Result<(), String> {
    let skills_dir = format!("{}/.uac/skills", project_root);
    std::fs::create_dir_all(&skills_dir).map_err(|e| format!("Failed to create skills dir: {}", e))?;
    let skill_dir = format!("{}/{}", skills_dir, id);
    std::fs::create_dir_all(&skill_dir).map_err(|e| format!("Failed to create skill dir: {}", e))?;
    let mut fm = format!("---\nname: \"{}\"\ndescription: \"{}\"\n---\n\n", name, description);
    fm.push_str(&body);
    std::fs::write(format!("{}/SKILL.md", skill_dir), fm).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_project_skill(project_root: String, id: String, name: String, description: String, body: String) -> Result<(), String> {
    let skill_md = format!("{}/.uac/skills/{}/SKILL.md", project_root, id);
    let mut fm = format!("---\nname: \"{}\"\ndescription: \"{}\"\n---\n\n", name, description);
    fm.push_str(&body);
    std::fs::write(&skill_md, fm).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_project_skill(project_root: String, id: String) -> Result<(), String> {
    let skill_dir = format!("{}/.uac/skills/{}", project_root, id);
    if std::path::Path::new(&skill_dir).exists() {
        std::fs::remove_dir_all(&skill_dir).map_err(|e| format!("Failed to delete skill: {}", e))?;
    }
    Ok(())
}

// ====================== PROJECT ADOPTION PREVIEW ======================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectPreview {
    project_root: String,
    detected_agents: Vec<String>,
    opencode_mcp_count: usize,
    claudecode_mcp_count: usize,
    agy_mcp_count: usize,
    existing_skills: Vec<String>,
    is_adopted: bool,
}

#[tauri::command]
fn get_project_preview(project_root: String) -> Result<ProjectPreview, String> {
    let root = std::path::Path::new(&project_root);
    if !root.exists() || !root.is_dir() {
        return Err("Project root does not exist or is not a directory".into());
    }

    let detected_agents = detect_agents_for_project(&project_root);
    let is_adopted = root.join(".uac").exists();

    // Count MCPs in each agent's config file
    let opencode_mcp_count = count_opencode_mcps(root);
    let claudecode_mcp_count = count_claudecode_mcps(root);
    let agy_mcp_count = count_agy_mcps(root);

    // Scan for existing skills in any of the three agent dirs
    let mut existing_skills = Vec::new();
    for dir_name in &[".opencode/skills", ".claude/skills", ".agents/skills"] {
        let skills_dir = root.join(dir_name);
        if skills_dir.exists() && !std::fs::symlink_metadata(&skills_dir).map_or(false, |m| m.file_type().is_symlink()) {
            if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map_or(false, |ft| ft.is_dir()) {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        if !existing_skills.contains(&name) {
                            existing_skills.push(name);
                        }
                    }
                }
            }
        }
    }
    existing_skills.sort();

    Ok(ProjectPreview { project_root, detected_agents, opencode_mcp_count, claudecode_mcp_count, agy_mcp_count, existing_skills, is_adopted })
}

fn count_opencode_mcps(root: &std::path::Path) -> usize {
    for name in &[".opencode/opencode.json", ".opencode/opencode.jsonc"] {
        let path = root.join(name);
        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                let cleaned = clean_jsonc(&content);
                if let Ok(parsed) = serde_json::from_str::<OpenCodeConfigFile>(&cleaned) {
                    if let Some(mcp) = parsed.mcp {
                        return mcp.len();
                    }
                }
            }
        }
    }
    0
}

fn count_claudecode_mcps(root: &std::path::Path) -> usize {
    let path = root.join(".mcp.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<ClaudeConfigFile>(&content) {
                if let Some(mcp) = parsed.mcp_servers {
                    return mcp.len();
                }
            }
        }
    }
    0
}

fn count_agy_mcps(root: &std::path::Path) -> usize {
    let path = root.join(".agents/mcp_config.json");
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(parsed) = serde_json::from_str::<AgyMcpConfig>(&content) {
                if let Some(mcp) = parsed.mcp_servers {
                    return mcp.len();
                }
            }
        }
    }
    0
}

// ====================== SAVED PROJECTS LIST ======================

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SavedProject {
    id: String,
    name: String,
    path: String,
    detected_agents: Vec<String>,
    uac_adopted: bool,
}

fn uac_projects_path() -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    Ok(format!("{}/.config/uac/projects.json", home))
}

fn detect_agents_for_project(project_root: &str) -> Vec<String> {
    let mut agents = Vec::new();
    let root = std::path::Path::new(project_root);

    // OpenCode: .opencode/ dir or opencode.json / opencode.jsonc in root
    if root.join(".opencode").exists()
        || root.join("opencode.json").exists()
        || root.join("opencode.jsonc").exists()
    {
        agents.push("OpenCode".to_string());
    }

    // Claude Code: .mcp.json in root or .claude/ dir or CLAUDE.md
    if root.join(".mcp.json").exists()
        || root.join(".claude").exists()
        || root.join("CLAUDE.md").exists()
    {
        agents.push("ClaudeCode".to_string());
    }

    // AGY / Antigravity: .agents/ dir or AGENTS.md or GEMINI.md
    if root.join(".agents").exists()
        || root.join("AGENTS.md").exists()
        || root.join("GEMINI.md").exists()
    {
        agents.push("AGY".to_string());
    }

    agents
}

fn load_saved_projects() -> Result<Vec<SavedProject>, String> {
    let path = uac_projects_path()?;
    if !std::path::Path::new(&path).exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if content.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse projects.json: {}", e))
}

fn save_saved_projects(projects: &[SavedProject]) -> Result<(), String> {
    let path = uac_projects_path()?;
    let parent = std::path::Path::new(&path).parent().unwrap();
    std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let json = serde_json::to_string_pretty(projects).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_saved_projects() -> Result<Vec<SavedProject>, String> {
    load_saved_projects()
}

#[tauri::command]
fn add_saved_project(path: String) -> Result<SavedProject, String> {
    let root = std::path::Path::new(&path);
    if !root.exists() || !root.is_dir() {
        return Err("Path does not exist or is not a directory".into());
    }

    let mut projects = load_saved_projects()?;

    // Deduplicate by path
    if projects.iter().any(|p| p.path == path) {
        return projects.iter().find(|p| p.path == path).cloned()
            .ok_or_else(|| "Project already exists".into());
    }

    let name = root.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let detected_agents = detect_agents_for_project(&path);
    let uac_adopted = root.join(".uac").exists();

    let project = SavedProject {
        id: format!("{:x}", md5_hash(&path)),
        name,
        path,
        detected_agents,
        uac_adopted,
    };

    projects.insert(0, project.clone());
    save_saved_projects(&projects)?;
    Ok(project)
}

#[tauri::command]
fn remove_saved_project(path: String) -> Result<(), String> {
    let mut projects = load_saved_projects()?;
    projects.retain(|p| p.path != path);
    save_saved_projects(&projects)
}

#[tauri::command]
fn scan_directory_for_projects(dir_path: String) -> Result<Vec<SavedProject>, String> {
    let root = std::path::Path::new(&dir_path);
    if !root.exists() || !root.is_dir() {
        return Err("Scan directory does not exist or is not a directory".into());
    }

    let mut projects = load_saved_projects()?;
    let existing_paths: std::collections::HashSet<String> = projects.iter().map(|p| p.path.clone()).collect();
    let mut found = Vec::new();

    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            if entry.file_type().map_or(false, |ft| ft.is_dir()) {
                let entry_path = entry.path().to_string_lossy().into_owned();
                let detected = detect_agents_for_project(&entry_path);

                // Only include if it has at least one agent config
                if !detected.is_empty() && !existing_paths.contains(&entry_path) {
                    let name = entry.file_name().to_string_lossy().into_owned();
                    let uac_adopted = entry.path().join(".uac").exists();
                    let project = SavedProject {
                        id: format!("{:x}", md5_hash(&entry_path)),
                        name,
                        path: entry_path,
                        detected_agents: detected,
                        uac_adopted,
                    };
                    projects.insert(0, project.clone());
                    found.push(project);
                }
            }
        }
    }

    if !found.is_empty() {
        save_saved_projects(&projects)?;
    }
    Ok(found)
}

fn md5_hash(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}

// ====================== END PROJECT-LEVEL ======================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_cli::init())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_decorations(false);
                }
            }

            // Parse CLI arguments
            if let Ok(matches) = app.cli().matches() {
                if let Some(path_arg) = matches.args.get("path") {
                    if let Some(value) = path_arg.value.as_str() {
                        let path = if value == "." {
                            std::env::current_dir()
                                .map(|p| p.to_string_lossy().into_owned())
                                .unwrap_or_else(|_| value.to_string())
                        } else {
                            value.to_string()
                        };
                        if let Ok(mut cli_path) = CLI_PATH.lock() {
                            *cli_path = Some(path);
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet, 
            get_platform_info, 
            get_opencode_config, 
            migrate_opencode_config,
            toggle_mcp_server,
            toggle_skill,
            get_claudecode_config,
            migrate_claudecode_config,
            toggle_claudecode_mcp_server,
            toggle_claudecode_skill,
            get_agy_config,
            migrate_agy_config,
            toggle_agy_mcp_server,
            toggle_agy_skill,
            share_mcp_server,
            register_mcp_on_agent,
            get_cli_args,
            get_project_config,
            adopt_project,
            upsert_project_mcp,
            remove_project_mcp,
            toggle_project_skill,
            create_project_skill,
            update_project_skill,
            delete_project_skill,
            get_saved_projects,
            add_saved_project,
            remove_saved_project,
            scan_directory_for_projects,
            get_project_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
