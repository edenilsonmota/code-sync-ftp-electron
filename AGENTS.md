# AGENTS

Guidance for AI coding agents working in this repository.

## Project At A Glance

- Desktop Electron app that syncs local file changes to FTP.
- Main entrypoint: `main.js`.
- Application composition: `src/main/application.js`.
- Preload bridge: `src/preload.js`.
- UI layer: `src/renderer/index.html` + `src/renderer/renderer.js`.
- Primary documentation: [README.md](README.md).

## Run And Build

- Use Docker Compose as the standard workflow for Linux, macOS, and WSL.
- Start development GUI app on Linux desktop sessions: `docker compose --profile dev up --build app-dev`
- Build Linux installer(s) including Arch package output: `docker compose --profile build run --rm app-build`
- For Windows run/build, use local npm workflow (`npm install`, `npm start`, `npm run dist -- --win`).
- Optional cleanup: `docker compose down -v`

## Architecture Boundaries

- Keep `main.js` as a minimal bootstrap.
- Keep application composition and lifecycle in `src/main/application.js`.
- Keep FTP operations in `src/main/ftp`, sync/watchers in `src/main/sync`, IPC registration in `src/main/ipc`, and window/tray behavior in `src/main/ui`.
- Keep the narrow, allow-listed IPC bridge in `src/preload.js`.
- Keep renderer/UI logic in `src/renderer/renderer.js` and markup/styles in `src/renderer/index.html`.
- Communicate between layers via existing IPC channels; prefer extending current channels over introducing parallel patterns.

## Existing Conventions

- Persist configuration through `electron-store` under the `config` key.
- Config shape expected by sync flow:
  - `host`, `user`, `password`, `port`
  - `projects: [{ local, remote }]`
- Sync state relies on these main-process flags: `isSyncing`, `isUploading`, `uploadQueue`, `watchers`.
- When changing sync start/stop behavior, keep tray label updates and renderer button state transitions in sync.
- User-facing strings are currently in Portuguese; keep language consistent unless asked to localize.

## Pitfalls And Safety Notes

- Preserve `nodeIntegration: false`, `contextIsolation: true`, the sandbox, and the renderer Content Security Policy.
- Preserve single-instance behavior (`app.requestSingleInstanceLock()`).
- Preserve close/minimize-to-tray behavior when editing window lifecycle code.
- Always ensure watcher cleanup on stop/restart (`stopAllWatchers()`) to avoid duplicate watchers.

## Validation

- Run `npm run check` and `npm test` for static and automated validation.
- After code changes, validate by running the app via compose (`docker compose --profile dev up --build app-dev`) and manually checking:
  - start/stop sync flow
  - tray actions (open/start-stop/exit)
  - log updates in renderer
- Ensure the Linux host graphical session permissions allow containerized GUI apps.
