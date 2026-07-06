# Unified Agent Control

A desktop application that serves as a centralized management hub for multiple AI coding agents. Configure, monitor, and control agents like **OpenCode**, **Claude Code**, and **AGY (Gemini)** from a single interface.

## Installation

### Quick Install (curl)

```bash
curl -fsSL https://raw.githubusercontent.com/muhammad-shameel-ks/unified-agent-control/main/install.sh | bash
```

This detects your distro (Debian/Ubuntu, Arch, or AppImage fallback) and installs the latest release.

### Manual Download

Download the latest `.deb`, `.pkg.tar.zst`, or `.AppImage` from the [Releases](https://github.com/muhammad-shameel-ks/unified-agent-control/releases) page.

```bash
# Debian/Ubuntu
sudo dpkg -i unified-agent-control_*.deb

# Arch Linux
sudo pacman -U unified-agent-control-*.pkg.tar.zst

# AppImage
chmod +x unified-agent-control_*.AppImage
./unified-agent-control_*.AppImage
```

## CLI Usage

```bash
uac              # Open the application
uac <path>       # Open with a specific project directory (coming soon)
uac update       # Update to the latest release from GitHub
```

## Features

- **Agent Dashboard** — View and manage OpenCode, Claude Code, and AGY agents with real-time status
- **Project Management** — Associate projects with agents, track running/idle state, and launch sessions
- **MCP Server Control** — Enable/disable Model Context Protocol servers per agent with persistent config
- **Skill Management** — Toggle agent skills with automatic config sync to disk
- **Config Migration** — One-click migration of agent configs to a unified `~/.config/uac/` structure with symlinks
- **Global Settings** — Shared MCP servers, unified skill sets, and global agent rules
- **Dark/Light Mode** — Smooth theme transitions using the View Transitions API
- **Linux-First** — Custom window controls with Hyprland/Wayland compositor support

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + shadcn/ui + BEUI |
| Animation | Motion (Framer Motion) |
| Backend | Tauri v2 + Rust |
| Package Manager | pnpm |

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install)
- [pnpm](https://pnpm.io/)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

### Install Dependencies

```bash
pnpm install
```

### Development

```bash
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Project Structure

```
unified-agent-control/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/
│   │   ├── dashboard.tsx       # Agent cards, project list, config modals
│   │   ├── global-settings.tsx # MCP servers, skills, rules
│   │   ├── sidebar.tsx         # Navigation sidebar
│   │   ├── window-controls.tsx # Custom titlebar (Linux)
│   │   └── motion/             # Animated UI components (BEUI)
│   ├── lib/                    # Utilities and hooks
│   └── App.tsx                 # Root layout and routing
│
├── src-tauri/              # Backend (Rust)
│   └── src/
│       ├── main.rs             # Entry point
│       ├── lib.rs              # Tauri commands (config I/O, migration, platform detection)
│       └── updater.rs          # Self-update logic
│
├── install.sh              # Curl install script
├── public/icons/           # Agent brand assets
└── package.json
```

## How It Works

Unified Agent Control reads and writes agent configuration files directly on disk:

- **OpenCode** — Reads `~/.config/opencode/opencode.json` (JSONC) and `skills/` directory
- **Claude Code** — Reads `~/.claude.json` and `~/.claude/skills/`
- **AGY (Gemini)** — Reads `~/.gemini/config/mcp_config.json` and `skills/`

The app can migrate these configs into a centralized `~/.config/uac/` directory and create symlinks back to the original locations, letting you manage everything from one place while agents continue working normally.

## License

MIT
