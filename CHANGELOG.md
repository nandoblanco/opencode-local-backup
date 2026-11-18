# Changelog

## Unreleased

- Removed the trailing keyboard shortcut badge (`Ctrl+Shift+B`) from the left sidebar `vertical-tabs-backups` button and added `whitespace-nowrap` so sidebar button labels do not wrap (`gui.tsx`).
- Expanded the cross-plugin Playwright suite (`test/panel-fallback.tsx`, `test/panel-fallback.mjs`) to verify sidebar labels and icons (`Search`, `DLab Balance`, `Token Audit`), `DLab Balance` timeframe and date-range model breakdowns, `Token Audit` sorting, manual tagging, and `Per Tag` view, and `Search` centered loading spinner.

## 1.1.0 (2026-11-12)

- Added OpenCode Desktop Backup Manager (`gui.tsx`, `gui.css`, `dist/gui-experimental.cjs`, and `BackupRpc` in `rpc.js`) with a persistent side panel (`Ctrl+Shift+B` to open/focus, `Ctrl+Alt+B` to toggle), fallback dialog when no session is active, scope/tool/date/retention filters, unified diff preview, and validated snapshot restore with pre-restore safety backups.
- Added Desktop GUI smoke and fallback dialog tests (`test/gui-smoke.mjs`, `test/panel-fallback.mjs`).

## 1.0.3 (2026-10-28)

- Refined the `/backups` OpenTUI modal layout (`tui.ts`) with bordered filter and diff cards and removed duplicate slash command aliases.

## 1.0.2 (2026-10-27)

- Fixed `backup_list` and `backup_restore` tool registration on the OpenCode V2 server plugin API (`index.js`).

## 1.0.1 (2026-10-26)

- Scoped npm package as `@nandoblanco/opencode-local-backup` with public `publishConfig` and normalized `bin` and `repository` fields.
- Hardened relative path traversal checks on restore, external diff binary spawning (`openExternalDiff`), and comment-preserving JSONC config installation (`installPlugin`).

## 1.0.0 (2026-10-26)

- Initial release of `opencode-local-backup` for OpenCode.
- Added engine-level `execute.before` hook intercepting `edit`, `write`, `patch`, `apply_patch`, and `multiedit` tool calls to snapshot files into `<project-root>/.backups/<timestamp>_<slug>/` with `.backup-meta.json`.
- Added upward project-root resolution (`findProjectRoot`), configurable retention auto-pruning (`pruneBackups`), pre-restore safety snapshots (`restoreSnapshot`), `backup_list` and `backup_restore` agent tools, CLI commands (`install`, `list`, `restore`, `prune`, `root`), and the zero-token `/backups` TUI diff and restore modal (`tui.ts`).
