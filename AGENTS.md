# AGENTS

Guidance for AI coding agents working in this repository.

## Project At A Glance

- Desktop Electron app that syncs local file changes to FTP.
- Main entrypoint: `main.js`.
- UI layer: `index.html` + `renderer.js`.
- Primary documentation: [README.md](README.md).

## Run And Build

- Use Docker Compose as the standard workflow for Linux, macOS, and WSL.
- Start development GUI app on Linux desktop sessions: `docker compose --profile dev up --build app-dev`
- Build Linux installer(s) including Arch package output: `docker compose --profile build run --rm app-build`
- For Windows run/build, use local npm workflow (`npm install`, `npm start`, `npm run dist -- --win`).
- Optional cleanup: `docker compose down -v`

## Architecture Boundaries

- Keep Electron main-process logic in `main.js`:
  - app lifecycle, tray, window behavior
  - FTP connection and sync queue
  - filesystem watchers (`chokidar`)
  - IPC handlers (`ipcMain`)
- Keep renderer/UI logic in `renderer.js` and markup/styles in `index.html`.
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

- This app currently uses `nodeIntegration: true` and `contextIsolation: false`; do not refactor this security model unless explicitly requested.
- Preserve single-instance behavior (`app.requestSingleInstanceLock()`).
- Preserve close/minimize-to-tray behavior when editing window lifecycle code.
- Always ensure watcher cleanup on stop/restart (`stopAllWatchers()`) to avoid duplicate watchers.

## Validation

- There are no test or lint scripts in `package.json`.
- After code changes, validate by running the app via compose (`docker compose --profile dev up --build app-dev`) and manually checking:
  - start/stop sync flow
  - tray actions (open/start-stop/exit)
  - log updates in renderer
- Ensure the Linux host graphical session permissions allow containerized GUI apps.
