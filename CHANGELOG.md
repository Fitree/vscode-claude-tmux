# Changelog

## 1.0.5 (2026-03-16)

### Bug Fixes
- **Fix "Terminal has already been disposed" error** — Focus command now handles disposed terminals in remote/container environments gracefully
- **Fix session name input not appearing on Create** — Input box now shows before terminal creation to prevent focus stealing

## 1.0.0 (2026-03-15)

### Features
- **Claude Tmux: Focus** — Focus existing Claude Tmux tab or create a new tmux session with `claude -c --ide`
- **Claude Tmux: New** — Open a new tmux window with a fresh `claude --ide` session
- **Claude Tmux: Resume** — Browse and resume past Claude Code sessions via quick pick dropdown
- Default keybinding: `Cmd+Shift+0` (Mac) / `Ctrl+Shift+0` (Win/Linux)
