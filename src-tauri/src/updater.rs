use serde::Deserialize;
use std::process::Command;

const GITHUB_REPO: &str = "muhammad-shameel-ks/unified-agent-control";

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

pub fn run_update() -> Result<(), String> {
    let current_version = get_current_version();
    println!("Current version: v{}", current_version);
    println!("Checking for updates...");

    let release = fetch_latest_release()?;
    let latest_version = release.tag_name.trim_start_matches('v');

    if current_version == latest_version {
        println!("Already up to date (v{}).", current_version);
        return Ok(());
    }

    println!("New version available: v{}", latest_version);

    let current = semver::Version::parse(current_version)
        .map_err(|e| format!("Invalid current version: {}", e))?;
    let latest = semver::Version::parse(latest_version)
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

    let tmp_dir = std::env::temp_dir().join("uac-update");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let download_path = tmp_dir.join(&asset.name);

    download_file(&asset.browser_download_url, &download_path)?;
    println!("Downloaded to {}", download_path.display());

    println!("Installing...");

    match distro.as_str() {
        "arch" | "manjaro" | "endeavouros" => {
            let status = Command::new("sudo")
                .args(["pacman", "-U", "--noconfirm"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run pacman: {}", e))?;
            if !status.success() {
                return Err("pacman install failed".to_string());
            }
        }
        "fedora" | "rhel" | "centos" | "rocky" | "alma" => {
            let status = Command::new("sudo")
                .args(["rpm", "-i"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run rpm: {}", e))?;
            if !status.success() {
                return Err("rpm install failed".to_string());
            }
        }
        "ubuntu" | "debian" | "linuxmint" | "pop" => {
            let status = Command::new("sudo")
                .args(["dpkg", "-i"])
                .arg(download_path.to_str().unwrap())
                .status()
                .map_err(|e| format!("Failed to run dpkg: {}", e))?;
            if !status.success() {
                return Err("dpkg install failed".to_string());
            }
        }
        _ => {
            let install_path = std::path::PathBuf::from("/usr/local/bin/uac");
            std::fs::copy(&download_path, &install_path)
                .map_err(|e| format!("Failed to copy binary: {}", e))?;
            Command::new("chmod")
                .args(["+x", install_path.to_str().unwrap()])
                .status()
                .map_err(|e| e.to_string())?;
        }
    }

    // Cleanup
    let _ = std::fs::remove_dir_all(&tmp_dir);

    println!("Updated to v{} successfully!", latest_version);
    Ok(())
}
