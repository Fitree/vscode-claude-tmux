# Claude Tmux Focus

Manage Claude Code sessions inside tmux, directly in the VS Code editor area.

One shortcut to focus your Claude terminal -- or create, resume, and switch between sessions without leaving the editor.

## Features

### Claude Tmux: Focus (`Cmd+Shift+0`)

Focus the existing Claude Tmux terminal tab. If no tab exists, attaches to the current tmux session. If no tmux session is running, shows a resume picker of existing Claude Code sessions. If no past sessions exist, prompts for a name and starts a fresh session.

**No tab exists** -- creates and focuses the Claude Tmux tab:

<video src="assets/Focus1.mp4" controls></video>

**Tab exists but not focused** -- switches focus to the Claude Tmux tab:

<video src="assets/Focus2.mp4" controls></video>

### Claude Tmux: Focus Window (`Cmd+Shift+9`)

Shows a dropdown of running tmux windows (with pane titles) and switches to the selected window.

<video src="assets/FocusWindow1.mp4" controls></video>

### Claude Tmux: Create Window (`Cmd+Shift+8`)

Shows a dropdown with "New Claude Code Session" at the top, followed by existing Claude Code sessions. Selecting "New" prompts for a session name and starts a fresh `claude --ide` instance. Selecting an existing session resumes it in a new tmux window.

**New session:**

<video src="assets/Create1-newCCsession.mp4" controls></video>

**Resume existing session:**

<video src="assets/Create2-resumeCCsession.mp4" controls></video>

## How It Works

- All Claude Code sessions run inside tmux and appear as editor-area tabs in VS Code.
- tmux windows are named with Claude Code session IDs for tracking.
- New sessions automatically send `/rename` to Claude for session identification.

## Requirements

- [tmux](https://github.com/tmux/tmux) must be installed and available in your PATH
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed

## Installation

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=songusb-leo-lee.claude-tmux-focus) or search "Claude Tmux Focus" in the Extensions view.

## Keybindings

| Command | Default (Mac) | Default (Win/Linux) |
|---------|--------------|-------------------|
| Claude Tmux: Focus | `Cmd+Shift+0` | `Ctrl+Shift+0` |
| Claude Tmux: Focus Window | `Cmd+Shift+9` | `Ctrl+Shift+9` |
| Claude Tmux: Create Window | `Cmd+Shift+8` | `Ctrl+Shift+8` |

All keybindings can be customized via `Preferences: Open Keyboard Shortcuts`.

## License

MIT
