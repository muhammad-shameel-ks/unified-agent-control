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
