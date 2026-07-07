#!/usr/bin/env bash
set -euo pipefail

REPO="muhammad-shameel-ks/unified-agent-control"
BINARY_NAME="unified-agent-control"
INSTALL_DIR="/usr/local/bin"
TMP_DIR=$(mktemp -d)

cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

info()  { printf "\033[1;34m[info]\033[0m  %s\n" "$1" >&2; }
ok()    { printf "\033[1;32m[ok]\033[0m    %s\n" "$1" >&2; }
warn()  { printf "\033[1;33m[warn]\033[0m  %s\n" "$1" >&2; }
error() { printf "\033[1;31m[error]\033[0m %s\n" "$1" >&2; exit 1; }

check_dep() {
    command -v "$1" >/dev/null 2>&1 || error "'$1' is required but not installed."
}

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        echo "${ID:-unknown}"
    else
        echo "unknown"
    fi
}

detect_arch() {
    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64|amd64)   echo "amd64" ;;
        aarch64|arm64)   echo "aarch64" ;;
        *)               echo "$arch" ;;
    esac
}

get_latest_version() {
    curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
        | grep '"tag_name"' \
        | sed -E 's/.*"tag_name": *"v?([^"]+)".*/\1/'
}

get_installed_version() {
    if command -v "$BINARY_NAME" >/dev/null 2>&1; then
        "$BINARY_NAME" --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "0.0.0"
    else
        echo "0.0.0"
    fi
}

download_asset() {
    local version="$1"
    local distro="$2"
    local arch="$3"
    local pattern

    case "$distro" in
        arch|manjaro|endeavouros)
            pattern=".pkg.tar.zst"
            ;;
        fedora|rhel|centos|rocky|alma)
            pattern=".rpm"
            ;;
        ubuntu|debian|linuxmint|pop)
            pattern=".deb"
            ;;
        *)
            pattern=".AppImage"
            ;;
    esac

    local api_url="https://api.github.com/repos/$REPO/releases/tags/v${version}"
    local download_url
    download_url=$(curl -fsSL "$api_url" \
        | grep -o "\"browser_download_url\": *\"[^\"]*${pattern}[^\"]*\"" \
        | head -1 \
        | sed -E 's/.*"browser_download_url": *"([^"]+)".*/\1/')

    if [ -z "$download_url" ]; then
        error "No matching asset found for v${version} (${pattern})"
    fi

    info "Downloading $(basename "$download_url")..."
    curl -sSfL "$download_url" -o "$TMP_DIR/$(basename "$download_url")"
    echo "$TMP_DIR/$(basename "$download_url")"
}

install_deps() {
    local distro="$1"
    case "$distro" in
        ubuntu|debian|linuxmint|pop)
            info "Installing system dependencies..."
            sudo apt-get update -qq
            sudo apt-get install -y -qq libwebkit2gtk-4.1-0 libappindicator3-1 librsvg2-2 patchelf
            ;;
        arch|manjaro|endeavouros)
            sudo pacman -S --noconfirm --needed webkit2gtk-4.1 libappindicator-gtk3 librsvg patchelf
            ;;
        fedora|rhel|centos|rocky|alma)
            sudo dnf install -y webkit2gtk4.1 libappindicator-gtk3 librsvg2 patchelf 2>/dev/null \
                || sudo yum install -y webkit2gtk4.1 libappindicator-gtk3 librsvg2 patchelf
            ;;
    esac
}

install_package() {
    local file="$1"
    local distro="$2"

    case "$distro" in
        arch|manjaro|endeavouros)
            sudo pacman -U --noconfirm "$file"
            ;;
        fedora|rhel|centos|rocky|alma)
            sudo rpm -i "$file"
            ;;
        ubuntu|debian|linuxmint|pop)
            sudo dpkg -i "$file" || sudo apt-get install -f -y
            ;;
        *)
            sudo install -m 755 "$file" "$INSTALL_DIR/$BINARY_NAME"
            ;;
    esac
}

main() {
    check_dep curl
    check_dep uname

    if [ "$(id -u)" -eq 0 ]; then
        error "Do not run this script as root. sudo will be used when needed."
    fi

    local distro arch
    distro=$(detect_distro)
    arch=$(detect_arch)
    info "Detected: $distro ($arch)"

    local latest_version current_version
    latest_version=$(get_latest_version)
    if [ -z "$latest_version" ]; then
        error "Could not fetch latest version from GitHub"
    fi
    info "Latest version: v$latest_version"

    current_version=$(get_installed_version)
    info "Installed version: v$current_version"

    if [ "$current_version" = "$latest_version" ]; then
        ok "Already up to date!"
        exit 0
    fi

    install_deps "$distro"

    local asset_path
    asset_path=$(download_asset "$latest_version" "$distro" "$arch")

    info "Installing..."
    install_package "$asset_path" "$distro"

    if ! command -v uac >/dev/null 2>&1; then
        sudo ln -sf "$(command -v "$BINARY_NAME")" "$INSTALL_DIR/uac" 2>/dev/null \
            || warn "Could not create 'uac' symlink; use '$BINARY_NAME' instead."
    fi

    ok "Unified Agent Control v$latest_version installed successfully!"
    info "Run 'uac' to start the application"
}

main "$@"
