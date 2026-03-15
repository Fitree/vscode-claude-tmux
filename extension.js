const vscode = require('vscode');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Get the workspace name from the first workspace folder.
 * Used to create unique tmux session and tab names per VS Code window.
 */
function getWorkspaceName() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? path.basename(folder.uri.fsPath) : 'default';
}

/**
 * Tmux session name. Uses underscore separator because tmux treats ":"
 * as session:window delimiter — colons in session names break all commands.
 */
function getTmuxSession() {
  return `Claude_${getWorkspaceName()}`;
}

function getTabName() {
  return `Claude:${getWorkspaceName()}`;
}

function getWorkspaceCwd() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME;
}

/**
 * Check if a terminal has a visible editor tab.
 * When a user closes an editor-area terminal tab, VS Code kills the process
 * but does NOT dispose the terminal object — it lingers as a zombie in
 * vscode.window.terminals. This function detects that by scanning the tab API.
 */
function hasVisibleTab(terminal) {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      // TabInputTerminal exists in VS Code 1.80+
      if (tab.input instanceof vscode.TabInputTerminal) {
        // No direct terminal reference on TabInputTerminal, so match by label
        if (tab.label === terminal.name) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Get the Claude project directory for the current workspace.
 * Claude stores sessions at ~/.claude/projects/<encoded-path>/
 */
function getProjectDir(workspacePath) {
  const encoded = workspacePath.replace(/\//g, '-');
  return path.join(process.env.HOME, '.claude', 'projects', encoded);
}

/**
 * Parse JSONL session files to extract session ID, name, and last timestamp.
 * Returns a promise resolving to sorted sessions (most recent first).
 */
async function listSessions(projectDir) {
  if (!fs.existsSync(projectDir)) return [];

  const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  const sessions = [];

  for (const file of files) {
    const sessionId = file.replace('.jsonl', '');
    const filePath = path.join(projectDir, file);
    let name = null;
    let firstUserMsg = null;
    let lastTs = null;

    const stream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      try {
        const obj = JSON.parse(line);
        if (obj.timestamp) lastTs = obj.timestamp;

        // Check for /rename command
        if (obj.type === 'system' && obj.content && obj.content.includes('/rename')) {
          const match = obj.content.match(/<command-args>(.*?)<\/command-args>/);
          if (match) name = match[1];
        }

        // Capture first real user message as fallback name
        if (!firstUserMsg && obj.type === 'user' && !obj.isMeta) {
          const content = obj.message?.content;
          if (typeof content === 'string' && !content.includes('<command-') && content.length > 5) {
            firstUserMsg = content.substring(0, 80);
          }
        }
      } catch {}
    }

    sessions.push({
      id: sessionId,
      name: name || firstUserMsg || sessionId,
      lastTs,
    });
  }

  // Sort by last timestamp, most recent first
  sessions.sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));
  return sessions;
}

/**
 * Run a shell command and return stdout as a promise.
 */
function exec(cmd) {
  return new Promise((resolve) => {
    cp.exec(cmd, (err, stdout) => resolve(err ? '' : stdout.trim()));
  });
}

/**
 * Check if the tmux session exists.
 */
async function tmuxSessionExists() {
  const session = getTmuxSession();
  const result = await exec(`tmux has-session -t "${session}" 2>/dev/null && echo "yes"`);
  return result === 'yes';
}

/**
 * Check if a tmux window with the given name exists in the session.
 * Returns the window index if found, null otherwise.
 */
async function findTmuxWindow(windowName) {
  const session = getTmuxSession();
  const sep = '|||';
  const output = await exec(`tmux list-windows -t "${session}" -F "#{window_index}${sep}#{window_name}" 2>/dev/null`);
  if (!output) return null;
  for (const line of output.split('\n')) {
    const sepIndex = line.indexOf(sep);
    if (sepIndex === -1) continue;
    const index = line.substring(0, sepIndex);
    const name = line.substring(sepIndex + sep.length);
    if (name === windowName) return index;
  }
  return null;
}

/**
 * After starting claude --ide "/rename ...", poll for the new JSONL file
 * and rename the tmux window to the session ID.
 */
function waitAndRenameWindow(projectDir, tmuxSession, tmpWindowName) {
  const windowTarget = `${tmuxSession}:${tmpWindowName}`;

  let beforeFiles;
  try {
    beforeFiles = new Set(fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl')));
  } catch {
    beforeFiles = new Set();
  }

  let resolved = false;
  const fileCheck = setInterval(() => {
    if (resolved) { clearInterval(fileCheck); return; }
    try {
      const currentFiles = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      for (const f of currentFiles) {
        if (!beforeFiles.has(f)) {
          resolved = true;
          clearInterval(fileCheck);
          const sessionId = f.replace('.jsonl', '');
          cp.exec(`tmux rename-window -t "${windowTarget}" "${sessionId}" 2>/dev/null`);
          return;
        }
      }
    } catch {}
  }, 2000);
  setTimeout(() => clearInterval(fileCheck), 180000);
}

/**
 * Get a live Claude terminal or create a new one.
 * A terminal is considered "live" only if it still has a visible editor tab.
 * Zombie terminals (closed tab but object still in vscode.window.terminals) are disposed.
 * Returns { terminal, isNew }.
 */
function getOrCreateTerminal() {
  const tabName = getTabName();

  // Check ALL terminals with our name (there may be multiple: live + zombies)
  for (const t of vscode.window.terminals) {
    if (t.name !== tabName) continue;
    if (hasVisibleTab(t)) {
      t.show(false);
      return { terminal: t, isNew: false };
    }
    // Zombie — dispose it (ignore errors if already disposed)
    try { t.dispose(); } catch {}
  }

  // Create a fresh terminal in the editor area
  const terminal = vscode.window.createTerminal({
    name: tabName,
    location: vscode.TerminalLocation.Editor,
  });
  return { terminal, isNew: true };
}

function activate(context) {
  // Claude Tmux: Focus — focus existing tab, attach to tmux, or fall back to resume picker
  const focusCmd = vscode.commands.registerCommand('claude-tmux-focus.open', async () => {
    const session = getTmuxSession();
    const { terminal, isNew } = getOrCreateTerminal();

    if (!isNew) return; // existing visible tab — already focused

    // New tab — check if tmux session already exists
    const exists = await tmuxSessionExists();
    if (exists) {
      terminal.sendText(`tmux attach -t "${session}"`);
      return;
    }

    // No tmux session — check for existing CC sessions to resume
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = workspacePath || process.env.HOME;

    if (workspacePath) {
      const projectDir = getProjectDir(workspacePath);
      const sessions = await listSessions(projectDir);

      if (sessions.length > 0) {
        // Show resume picker
        const items = sessions.map(s => ({
          label: s.name,
          description: s.id.substring(0, 8),
          detail: s.lastTs ? new Date(s.lastTs).toLocaleString() : undefined,
          sessionId: s.id,
        }));

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a Claude session to resume',
          matchOnDescription: true,
          matchOnDetail: true,
        });

        if (!picked) {
          terminal.dispose();
          return;
        }

        const sessionId = picked.sessionId;
        terminal.sendText(
          `tmux new-session -s "${session}" -n "${sessionId}" -c "${cwd}" \\; send-keys "claude --resume ${sessionId} --ide" Enter`
        );
        return;
      }
    }

    // No CC sessions — ask for a name and start fresh
    const sessionName = await vscode.window.showInputBox({
      prompt: 'Enter a name for the new Claude session',
      placeHolder: 'e.g., feature-auth, debug-api',
    });

    if (!sessionName) {
      terminal.dispose();
      return;
    }

    const projectDir2 = getProjectDir(cwd);
    if (!fs.existsSync(projectDir2)) {
      fs.mkdirSync(projectDir2, { recursive: true });
    }
    const tmpName = `_new_${Date.now()}`;
    const escaped = sessionName.replace(/'/g, "'\\''");
    terminal.sendText(
      `tmux new-session -s "${session}" -n "${tmpName}" -c "${cwd}" \\; send-keys "claude --ide '/rename ${escaped}'" Enter`
    );
    waitAndRenameWindow(projectDir2, session, tmpName);
  });

  // Claude Tmux: Focus Window — show tmux windows with pane titles, switch to selected
  const focusWindowCmd = vscode.commands.registerCommand('claude-tmux-focus.focusWindow', async () => {
    const session = getTmuxSession();
    const sep = '|||';
    const output = await exec(`tmux list-windows -t "${session}" -F "#{window_index}${sep}#{window_name}${sep}#{pane_title}" 2>/dev/null`);

    if (!output) {
      vscode.window.showInformationMessage('No tmux windows found for this workspace.');
      return;
    }

    const windows = [];
    for (const line of output.split('\n')) {
      const first = line.indexOf(sep);
      if (first === -1) continue;
      const second = line.indexOf(sep, first + sep.length);
      if (second === -1) continue;
      windows.push({
        index: line.substring(0, first),
        name: line.substring(first + sep.length, second),
        paneTitle: line.substring(second + sep.length),
      });
    }

    if (windows.length === 0) return;

    const items = windows.map(w => ({
      label: `${w.index}: ${w.paneTitle}`,
      description: w.name,
      windowIndex: w.index,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a tmux window to focus',
      matchOnDescription: true,
    });

    if (!picked) return;

    const { terminal, isNew } = getOrCreateTerminal();
    if (isNew) {
      terminal.sendText(`tmux attach -t "${session}" \\; select-window -t "${session}:${picked.windowIndex}"`);
    } else {
      cp.exec(`tmux select-window -t "${session}:${picked.windowIndex}"`);
    }
  });

  // Claude Tmux: Create Window — "New Claude Code Session" + existing CC sessions dropdown
  const createWindowCmd = vscode.commands.registerCommand('claude-tmux-focus.createWindow', async () => {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cwd = workspacePath || process.env.HOME;
    const session = getTmuxSession();
    const projectDir = getProjectDir(cwd);

    // Build picker items: "New" at top + existing sessions
    const items = [{ label: '$(add) New Claude Code Session', sessionId: null, alwaysShow: true }];

    if (workspacePath) {
      const sessions = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Loading Claude sessions...' },
        () => listSessions(projectDir)
      );
      for (const s of sessions) {
        items.push({
          label: s.name,
          description: s.id.substring(0, 8),
          detail: s.lastTs ? new Date(s.lastTs).toLocaleString() : undefined,
          sessionId: s.id,
        });
      }
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Create a new window or resume an existing session',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (!picked) return;

    const { terminal, isNew } = getOrCreateTerminal();

    if (picked.sessionId) {
      // Resume existing session — check if already running in a tmux window
      const windowIndex = await findTmuxWindow(picked.sessionId);
      if (windowIndex !== null) {
        if (isNew) {
          terminal.sendText(`tmux attach -t "${session}" \\; select-window -t "${session}:${windowIndex}"`);
        } else {
          cp.exec(`tmux select-window -t "${session}:${windowIndex}"`);
        }
        return;
      }

      // Open in new tmux window
      if (isNew) {
        terminal.sendText(
          `tmux has-session -t "${session}" 2>/dev/null && tmux attach -t "${session}" \\; new-window -n "${picked.sessionId}" -c "${cwd}" \\; send-keys "claude --resume ${picked.sessionId} --ide" Enter || tmux new-session -s "${session}" -n "${picked.sessionId}" -c "${cwd}" \\; send-keys "claude --resume ${picked.sessionId} --ide" Enter`
        );
      } else {
        const exists = await tmuxSessionExists();
        if (exists) {
          cp.exec(`tmux new-window -t "${session}" -n "${picked.sessionId}" -c "${cwd}" \\; send-keys "claude --resume ${picked.sessionId} --ide" Enter`);
        } else {
          terminal.sendText(`tmux new-session -s "${session}" -n "${picked.sessionId}" -c "${cwd}" \\; send-keys "claude --resume ${picked.sessionId} --ide" Enter`);
        }
      }
    } else {
      // New fresh session — ask for a name
      const sessionName = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new Claude session',
        placeHolder: 'e.g., feature-auth, debug-api',
      });

      if (!sessionName) return;

      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }
      const tmpName = `_new_${Date.now()}`;
      const escaped = sessionName.replace(/'/g, "'\\''");
      const claudeCmd = `claude --ide '/rename ${escaped}'`;

      if (isNew) {
        terminal.sendText(
          `tmux has-session -t "${session}" 2>/dev/null && tmux attach -t "${session}" \\; new-window -n "${tmpName}" -c "${cwd}" \\; send-keys "${claudeCmd}" Enter || tmux new-session -s "${session}" -n "${tmpName}" -c "${cwd}" \\; send-keys "${claudeCmd}" Enter`
        );
      } else {
        const exists = await tmuxSessionExists();
        if (exists) {
          cp.exec(`tmux new-window -t "${session}" -n "${tmpName}" -c "${cwd}" \\; send-keys "${claudeCmd}" Enter`);
        } else {
          terminal.sendText(`tmux new-session -s "${session}" -n "${tmpName}" -c "${cwd}" \\; send-keys "${claudeCmd}" Enter`);
        }
      }
      waitAndRenameWindow(projectDir, session, tmpName);
    }
  });

  context.subscriptions.push(focusCmd, focusWindowCmd, createWindowCmd);
}

function deactivate() {}

module.exports = { activate, deactivate };
