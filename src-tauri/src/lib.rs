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
            toggle_claudecode_skill
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
