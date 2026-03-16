# Changelog

## 1.1.0 (2026-03-17)

### New Commands
- **Claude Tmux: Create New** — Directly prompts for a session name and starts a fresh Claude session
- **Claude Tmux: Connect Claude Code Session** — Browse and resume existing Claude Code sessions (renamed from Create Window)
- **Claude Tmux: Remove** — Multi-select tmux windows to remove from the session
- **Claude Tmux: Focus on Previous Session** (`Cmd+Shift+,`) — Cycle to previous tmux window
- **Claude Tmux: Focus on Next Session** (`Cmd+Shift+.`) — Cycle to next tmux window

### Changes
- Focus keybinding changed from `Cmd+Shift+0` to `Cmd+Shift+I`
- "New Claude Code Session" option removed from Connect (formerly Create Window)
- Default keybindings removed for Focus Window and Connect commands

## 1.0.0 (2026-03-15)

### Features
- **Claude Tmux: Focus** — Focus existing Claude Tmux tab or create a new tmux session with `claude -c --ide`
- **Claude Tmux: New** — Open a new tmux window with a fresh `claude --ide` session
- **Claude Tmux: Resume** — Browse and resume past Claude Code sessions via quick pick dropdown
- Default keybinding: `Cmd+Shift+0` (Mac) / `Ctrl+Shift+0` (Win/Linux)
