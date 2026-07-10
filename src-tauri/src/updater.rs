use serde::Deserialize;
use std::process::Command;

const GITHUB_REPO: &str = "muhammad-shameel-ks/unified-agent-control";

const UAC_WRAPPER_BODY: &str = r#"#!/usr/bin/env bash
# uac — thin shim around the unified-agent-control binary.
# The binary handles detaching from the terminal for the GUI.
_uac_binary=""
for _dir in /usr/local/bin /usr/bin; do
    if [ -x "$_dir/unified-agent-control" ]; then
        _uac_binary="$_dir/unified-agent-control"
        break
    fi
done
if [ -z "$_uac_binary" ]; then
    echo "Error: unified-agent-control binary not found in /usr/local/bin or /usr/bin" >&2
    exit 1
fi
exec "$_uac_binary" "$@"
"#;

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

fn get_current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn update_log_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    std::path::PathBuf::from(home)
        .join(".config")
        .join("uac")
        .join("update.log")
}

fn log_line(msg: &str) {
    let path = update_log_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        use std::io::Write;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let _ = writeln!(f, "[{}] {}", timestamp, msg);
    }
}

fn fetch_latest_release() -> Result<GitHubRelease, String> {
    let url = format!("https://api.github.com/repos/{}/releases/latest", GITHUB_REPO);
    let body: String = ureq::get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .call()
        .map_err(|e| format!("Failed to fetch latest release: {}", e))?
        .body_mut()
        .read_to_string()
        .map_err(|e| format!("Failed to read response: {}", e))?;
    let release: GitHubRelease = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse release JSON: {}", e))?;
    Ok(release)
}

fn detect_distro() -> Result<String, String> {
    if std::path::Path::new("/etc/os-release").exists() {
        let content = std::fs::read_to_string("/etc/os-release").map_err(|e| e.to_string())?;
        for line in content.lines() {
            if let Some(id) = line.strip_prefix("ID=") {
                return Ok(id.trim_matches('"').to_string());
            }
        }
    }
    Err("Could not detect Linux distribution".to_string())
}

fn detect_arch() -> Result<String, String> {
    let output = Command::new("uname")
        .arg("-m")
        .output()
        .map_err(|e| format!("Failed to detect architecture: {}", e))?;
    let arch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    match arch.as_str() {
        "x86_64" | "amd64" => Ok("amd64".to_string()),
        "aarch64" | "arm64" => Ok("aarch64".to_string()),
        _ => Ok(arch),
    }
}

fn download_file(url: &str, dest: &std::path::Path) -> Result<(), String> {
    let mut resp = ureq::get(url)
        .call()
        .map_err(|e| format!("Failed to download: {}", e))?;

    let mut reader = resp.body_mut().as_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| format!("Failed to create file: {}", e))?;
    std::io::copy(&mut reader, &mut file).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

fn is_wrapper_stale(path: &std::path::Path) -> bool {
    // Stale = missing entirely, OR contains a `setsid`/`nohup`/`disown` detach
    // pattern from older install.sh revisions.
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return true,
    };
    content.contains("setsid") || content.contains("disown")
}

fn rewrite_user_wrapper() {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return,
    };
    let path = std::path::PathBuf::from(&home).join(".local").join("bin").join("uac");
    if path.exists() && is_wrapper_stale(&path) {
        if std::fs::write(&path, UAC_WRAPPER_BODY).is_ok() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
            }
            println!("Updated stale wrapper at {}", path.display());
            log_line(&format!("Rewrote stale user wrapper at {}", path.display()));
        }
    }
}

fn rewrite_system_wrapper() -> Result<(), String> {
    let path = std::path::PathBuf::from("/usr/local/bin/uac");
    if !path.exists() {
        return Ok(());
    }
    if !is_wrapper_stale(&path) {
        return Ok(());
    }
    let tmp = std::env::temp_dir().join("uac-wrapper.sh");
    std::fs::write(&tmp, UAC_WRAPPER_BODY)
        .map_err(|e| format!("Failed to write tmp wrapper: {}", e))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755));
    }
    let status = Command::new("sudo")
        .args(["install", "-m", "755"])
        .arg(&tmp)
        .arg(&path)
        .status()
        .map_err(|e| format!("Failed to run sudo install for wrapper: {}", e))?;
    let _ = std::fs::remove_file(&tmp);
    if !status.success() {
        return Err("sudo install of /usr/local/bin/uac wrapper failed".to_string());
    }
    println!("Updated stale wrapper at {}", path.display());
    log_line(&format!("Rewrote stale system wrapper at {}", path.display()));
    Ok(())
}

pub fn run_update() -> Result<(), String> {
    let current_version = get_current_version();
    println!("Current version: v{}", current_version);
    println!("Checking for updates...");
    log_line(&format!("update invoked; current=v{}", current_version));

    let release = match fetch_latest_release() {
        Ok(r) => r,
        Err(e) => {
            log_line(&format!("fetch_latest_release failed: {}", e));
            return Err(e);
        }
    };
    let latest_version = release.tag_name.trim_start_matches('v').to_string();

    if current_version == latest_version {
        println!("Already up to date (v{}).", current_version);
        log_line("already up to date");
        return Ok(());
    }

    println!("New version available: v{}", latest_version);

    let current = semver::Version::parse(current_version)
        .map_err(|e| format!("Invalid current version: {}", e))?;
    let latest = semver::Version::parse(&latest_version)
        .map_err(|e| format!("Invalid latest version: {}", e))?;

    if latest <= current {
        println!("Current version is newer or equal. Nothing to do.");
        return Ok(());
    }

    let distro = detect_distro()?;
    let _arch = detect_arch()?;

    let asset_pattern = match distro.as_str() {
        "arch" | "manjaro" | "endeavouros" => ".pkg.tar.zst",
        "fedora" | "rhel" | "centos" | "rocky" | "alma" => ".rpm",
        "ubuntu" | "debian" | "linuxmint" | "pop" => ".deb",
        _ => ".AppImage",
    };

    let asset = release
        .assets
        .iter()
        .find(|a| a.name.ends_with(asset_pattern))
        .ok_or_else(|| format!("No {} asset found for this release", asset_pattern))?;

    println!("Downloading {}...", asset.name);
    log_line(&format!("downloading {}", asset.name));

    let tmp_dir = std::env::temp_dir().join("uac-update");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let download_path = tmp_dir.join(&asset.name);

    download_file(&asset.browser_download_url, &download_path)?;
    println!("Downloaded to {}", download_path.display());

    println!("Installing...");
    log_line(&format!("installing via {} package manager", distro));

    match distro.as_str() {
        "arch" | "manjaro" | "endeavouros" => {
            let status = Command::new("sudo")
                .args(["pacman", "-U", "--noconfirm"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run pacman: {}", e))?;
            if !status.success() {
                let err = "pacman install failed".to_string();
                log_line(&err);
                return Err(err);
            }
        }
        "fedora" | "rhel" | "centos" | "rocky" | "alma" => {
            let status = Command::new("sudo")
                .args(["rpm", "-i"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run rpm: {}", e))?;
            if !status.success() {
                let err = "rpm install failed".to_string();
                log_line(&err);
                return Err(err);
            }
        }
        "ubuntu" | "debian" | "linuxmint" | "pop" => {
            let status = Command::new("sudo")
                .args(["dpkg", "-i"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run dpkg: {}", e))?;
            if !status.success() {
                let err = "dpkg install failed".to_string();
                log_line(&err);
                return Err(err);
            }
        }
        _ => {
            // AppImage fallback: install to /usr/local/bin/unified-agent-control
            // (the location install.sh uses), with sudo.
            let install_path = std::path::PathBuf::from("/usr/local/bin/unified-agent-control");
            let status = Command::new("sudo")
                .args(["install", "-m", "755"])
                .arg(download_path.to_str().unwrap())
                .arg(&install_path)
                .status()
                .map_err(|e| format!("Failed to run sudo install: {}", e))?;
            if !status.success() {
                let err = "sudo install of AppImage failed".to_string();
                log_line(&err);
                return Err(err);
            }
        }
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&tmp_dir);

    // Best-effort: rewrite any stale wrappers so `uac update` works next time.
    // We never fail the overall update because of this — the package install
    // is already complete.
    let _ = rewrite_system_wrapper();
    rewrite_user_wrapper();

    println!("Updated to v{} successfully!", latest_version);
    log_line(&format!("update complete: v{} -> v{}", current_version, latest_version));
    Ok(())
}
