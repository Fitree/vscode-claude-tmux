# Claude Tmux Focus

Manage Claude Code sessions inside tmux, directly in the VS Code editor area.

One shortcut to focus your Claude terminal — or create, resume, and switch between sessions without leaving the editor.

## Features

### Claude Tmux: Focus
Focus the existing Claude Tmux tab. If none exists, creates a new tmux session and launches `claude -c --ide`.

**Default keybinding:** `Cmd+Shift+0` (Mac) / `Ctrl+Shift+0` (Win/Linux)

### Claude Tmux: New
Open a new tmux window inside the Claude Tmux session and start a fresh `claude --ide` instance in your workspace directory.

### Claude Tmux: Resume
Browse past Claude Code sessions for the current workspace and resume one inside a new tmux window. If the selected session is already running, it focuses the existing window instead of creating a duplicate.

## Requirements

- [tmux](https://github.com/tmux/tmux) must be installed and available in your PATH
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=songusb-leo-lee.claude-tmux-focus) or search "Claude Tmux Focus" in the Extensions view.

## Keybindings

| Command | Default (Mac) | Default (Win/Linux) |
|---------|--------------|-------------------|
| Claude Tmux: Focus | `Cmd+Shift+0` | `Ctrl+Shift+0` |

All keybindings can be customized via `Preferences: Open Keyboard Shortcuts`.

## License

MIT
