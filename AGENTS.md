# Agent Notes

## Stack & entrypoints

- Tauri v2 + React 19 + TypeScript + Vite desktop app.
- Frontend entry: `src/main.tsx` → `src/App.tsx`.
- Rust entry: `src-tauri/src/main.rs` → `unified_agent_control_lib::run()`.
- `src-tauri/tauri.conf.json` drives build/dev commands and window config.

## Package manager

- **Use `pnpm`**. `pnpm-lock.yaml` is the lockfile; `src-tauri/tauri.conf.json` calls `pnpm dev` and `pnpm build`.
- Do not use `npm` or `bun install`; doing so will desync the lockfile.

## Common commands

```bash
pnpm dev          # Vite dev server on http://localhost:1420
pnpm build        # tsc + vite build -> dist/
pnpm tauri dev    # Tauri dev (runs pnpm dev via beforeDevCommand)
pnpm tauri build  # Tauri production build
```

## Styling / components

- Tailwind CSS v4 with `@import "tailwindcss"` syntax in `src/index.css`.
- shadcn/ui configured as `style: "base-luma"` in `components.json`.
- Path aliases match `components.json`: `@/components`, `@/lib`, `@/hooks`.
- BEUI registry is wired via `opencode.json` (`mcp.beui`). Install BEUI components with pnpm:
  ```bash
  pnpm exec shadcn add @beui/<component>
  ```
  (BEUI docs often show `bunx --bun shadcn add ...`; adapt to `pnpm exec` for this repo.)
- BEUI install names may not match the display name — verify the exact slug before installing (e.g. `@beui/button-base`, not `@beui/button`).
- ThemeToggle from `@beui/theme-toggle` requires `next-themes` and `motion` (Framer Motion) as runtime deps and a `ThemeProvider` wrapper.

## Tooling quirks

- TypeScript is strict with `noUnusedLocals` and `noUnusedParameters`; unused vars fail the build.
- `vite.config.ts` pins the dev server to port `1420` (`strictPort: true`) because Tauri expects it.
- `TAURI_DEV_HOST` env var enables HMR on port `1421` for mobile dev.
- Vite is told to ignore `src-tauri` to avoid rebuild loops.

## What is not set up

- No test runner, linter, or formatter is configured yet.
- No CI workflows or pre-commit hooks exist.

## What we understand & have implemented

### Unified Agent Syncing & Symlinking
- All agent preferences, global configurations, and custom skill folders are managed via UAC configuration mapping folders under the user's home configuration directory:
  - **OpenCode**: Configured globally in `~/.config/opencode/opencode.json` (or `opencode.jsonc`). Path is symlinked to `~/.config/uac/opencode-config` during migration.
  - **Claude Code**: Configured globally in `~/.claude.json` and custom skills in `~/.claude/skills/`. Migrated to `~/.config/uac/claude-config` and symlinked atomically at `~/.claude`.
  - **Antigravity CLI (AGY)**: Configured globally in `~/.gemini/config/mcp_config.json` and custom skills in `~/.gemini/config/skills/`. Migrated to `~/.config/uac/gemini-config` and symlinked at `~/.gemini/config`.

### Model Context Protocol (MCP) Sharing & Synchronization
- Commands split array logic:
  - OpenCode maps command arguments as a single unified array: `["npx", "-y", "@server"]`.
  - Claude Code and Antigravity split commands into a binary field `"command": "npx"` and parameters `"args": ["-y", "@server"]`.
- State mappings:
  - OpenCode: `"enabled": true/false`.
  - Claude Code: `"disabled": false/true`.
  - Antigravity: `"enabled": true/false`.
- Backend commands `share_mcp_server` and `register_mcp_on_agent` convert these formats in-memory dynamically when sharing or toggling registrations across agents in the dashboard.

### Skills Disabling Strategy
- Both Claude Code and AGY do not natively support an `enabled: false` setting flag on individual custom skills directories.
- To handle this cleanly and robustly, UAC renames the skill folder between `id` (active) and `id.disabled` (inactive) in the backend. When Claude Code or AGY scans the directories, inactive skills are transparently ignored.

### Key UX Components Installed
- `@beui/loader` (helix progress spinner variant).
- `@beui/checkbox` (custom motion checkbox wrapper used in the matrix).
- Window focus listeners automatically query the active agent's configuration from the disk, allowing instant updates if settings are modified outside UAC.
- Escape (`Esc`) key listener is bound to `<MorphingModal>` to automatically close all opened configurations.
