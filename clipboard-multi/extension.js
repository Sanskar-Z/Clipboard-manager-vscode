// 📋 Clipboard Manager for VS Code
// --------------------------------
// Main Extension Activation File

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const historyBackend = require('./historyBackend');
const ClipboardDataProvider = require('./clipboardDataProvider');

let dataProvider;

function activate(context) {
  // Find the extension's root directory
  const extensionPath = context.extensionPath;
  
  // Determine workspace path for history storage
  const workspacePath = path.join(extensionPath, 'data');
  // Ensure data directory exists
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  
  const historyFilePath = path.join(workspacePath, 'clipboard_history.json');
  
  // Try to locate the C++ backend binary
  const cliName = process.platform === 'win32' ? 'clipboard_manager.exe' : 'clipboard_manager';
  const configured = vscode.workspace.getConfiguration('clipboardManager').get('cliPath');
  const envPath = process.env.CLIPBOARD_MANAGER_CLI;
  let cliPath = null;

  // Try resolving CLI path in this order:
  // 1. User setting (most specific)
  // 2. Environment variable (for development)
  // 3. Parent directory of extension (default location)
  if (configured && typeof configured === 'string' && configured.trim()) {
    cliPath = configured;
  } else if (envPath && typeof envPath === 'string' && envPath.trim()) {
    cliPath = envPath;
  } else {
    // Look in parent directory of extension
    cliPath = path.join(path.dirname(extensionPath), cliName);
  }

  // Validate CLI exists
  if (!fs.existsSync(cliPath)) {
    const msg = `Clipboard Manager CLI not found at: ${cliPath}`;
    console.error(msg);
    vscode.window.showErrorMessage(msg);
  }

  // ✅ Ensure history file exists
  ensureHistoryFile(historyFilePath);

  // ✅ Initialize backend (pass CLI path so JS can call the C++ backend)
  historyBackend.init(historyFilePath, cliPath);

  // helper to run backend ops with progress UI
  async function runWithProgress(title, fn) {
    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `📋 ${title}`,
        cancellable: false
      }, async (progress) => {
        return await fn(progress);
      });
    } catch (err) {
      console.error('[Clipboard Manager] Operation failed:', err.message || err);
      warn(err.message || String(err));
    }
  }

  // ✅ Create and register TreeDataProvider
  dataProvider = new ClipboardDataProvider(historyBackend);
  vscode.window.registerTreeDataProvider('clipboardView', dataProvider);

  // --------------------------------------------------------------------------
  // 🧩 Commands
  // --------------------------------------------------------------------------

  register(context, 'clipboard.refresh', () => dataProvider.refresh());

  // ↩️ Undo last delete
  register(context, 'clipboard.undoDelete', async () => {
    await runWithProgress('Undoing last delete', async () => {
      const success = await historyBackend.undoDelete();
      if (success) dataProvider.refresh();
    });
  });

  // 🧹 Clear all history (with confirmation)
  register(context, 'clipboard.clearAll', async () => {
    const choice = await vscode.window.showWarningMessage(
      'Clear all clipboard history? This will remove pinned items as well.',
      { modal: true },
      'Clear'
    );
    if (choice !== 'Clear') return;

    await runWithProgress('Clearing clipboard history', async () => {
      const ok = await historyBackend.clearHistory();
      if (ok) {
        info('Cleared clipboard history');
        dataProvider.refresh();
      } else {
        warn('Failed to clear clipboard history');
      }
    });
  });

  // 📋 Copy selected text to slot
  register(context, 'clipboard.copy', async (args) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return warn('No active editor.');

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) return warn('No text selected.');

    await runWithProgress(`Saving to Slot ${args.slot}`, async () => {
      const ok = await historyBackend.saveToSlot(args.slot, selectedText);
      if (ok) info(`Copied to Slot ${args.slot}`);
      dataProvider.refresh();
    });
  });

  // 📥 Paste from slot
  register(context, 'clipboard.paste', async (args) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return warn('No active editor.');

    const text = historyBackend.getFromSlot(args.slot);
    if (!text) return warn(`Slot ${args.slot} is empty.`);

    await editor.edit((builder) => builder.replace(editor.selection, text));
    info(`Pasted from Slot ${args.slot}`);
  });

  // 💾 Copy and Save (handles string, object, or selection)
  register(context, 'clipboard.copyAndSave', async (textArg) => {
    const text = await resolveTextArg(textArg);
    if (!text) return warn('Nothing to copy.');

    await runWithProgress('Saving to clipboard history', async () => {
      const ok = await historyBackend.addToHistory(text);
      if (ok) info('Saved to clipboard history.');
      dataProvider.refresh();
    });
  });

  // 📌 Pin item
  register(context, 'clipboard.pin', (item) => {
    const cleanText = getItemText(item);
    if (!cleanText) return;

    runWithProgress('Pinning item', async () => {
      const ok = await historyBackend.pinItem(cleanText);
      ok ? info(`Pinned: "${short(cleanText)}"`) : warn('Item already pinned or invalid.');
      dataProvider.refresh();
    });
  });

  // 📍 Unpin item
  register(context, 'clipboard.unpin', (item) => {
    const cleanText = getItemText(item);
    if (!cleanText) return;

    runWithProgress('Unpinning item', async () => {
      const ok = await historyBackend.unpinItem(cleanText);
      ok ? info(`Unpinned: "${short(cleanText)}"`) : warn('Item not found in pinned list.');
      dataProvider.refresh();
    });
  });

  // � Paste an arbitrary text item into the active editor (used by clicking history/pinned/search items)
  register(context, 'clipboard.pasteItem', async (textArg) => {
    const text = await resolveTextArg(textArg);
    if (!text) return warn('Nothing to paste.');

    const editor = vscode.window.activeTextEditor;
    if (!editor) return warn('No active editor.');

    await editor.edit((builder) => builder.replace(editor.selection, text));
    info('Pasted item into editor.');
  });

  // 📋 Copy a history/pinned/search item to the system clipboard (so it can be pasted outside VS Code)
  register(context, 'clipboard.copyToClipboard', async (item) => {
    const text = getItemText(item);
    if (!text) return warn('Nothing to copy.');

    try {
      await vscode.env.clipboard.writeText(text);
      info('Copied item to system clipboard.');
    } catch (err) {
      console.error('[Clipboard Manager] Failed to copy to system clipboard:', err.message || err);
      warn('Failed to copy to system clipboard.');
    }
  });

  // �🗑️ Delete item (with confirmation)
  register(context, 'clipboard.delete', async (item) => {
    const cleanText = getItemText(item);
    if (!cleanText) return;

    const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
      placeHolder: `🗑️ Delete "${short(cleanText)}" from clipboard history?`,
    });

    if (confirm === 'Yes') {
      await runWithProgress('Deleting item', async () => {
        const success = await historyBackend.deleteItem(cleanText);
        if (success) info(`Deleted: "${short(cleanText)}"`);
        else warn('Item not found in history.');
        dataProvider.refresh();
      });
    }
  });

  // 🔍 Search clipboard history
  register(context, 'clipboard.search', async () => {
    const query = await vscode.window.showInputBox({
      prompt: '🔍 Search clipboard history...',
      placeHolder: 'Type a keyword to filter clipboard entries',
    });

    if (query !== undefined) {
      dataProvider.search(query); // ✅ correct call — uses provider’s search()
    }
  });

  // ↩️ Exit search view (clears search filter)
  register(context, 'clipboard.exitSearch', () => {
    if (dataProvider) dataProvider.search('');
  });

  // --------------------------------------------------------------------------
  // ⚙️ Clipboard Auto-Capture
  // --------------------------------------------------------------------------
  
  // --------------------------------------------------------------------------
  // ⚙️ Clipboard Auto-Capture
  // 1) Capture on Ctrl+C (override copy command)
  // 2) Poll for external clipboard changes every 2s
  // We keep a shared `lastClipboard` variable so both mechanisms don't double-add
  let lastClipboard = '';

  // Initialize lastClipboard from current clipboard value (non-blocking)
  vscode.env.clipboard.readText().then((initial) => {
    try { lastClipboard = (initial || '').replace(/\r\n/g, '\n'); } catch (e) { lastClipboard = initial || ''; }
  }, () => { lastClipboard = ''; });

  // 1. Capture on Ctrl+C
  const disposable = vscode.commands.registerCommand('editor.action.clipboardCopyAction', async () => {
    // First run the default copy command (use the syntax-highlighting variant to preserve behavior)
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');

    // Then grab the copied text and add to history
    const raw = await vscode.env.clipboard.readText();
    const text = raw ? String(raw).replace(/\r\n/g, '\n') : raw;
    if (text && text.trim()) {
      const ok = await historyBackend.addToHistory(text);
      if (ok) {
        lastClipboard = text; // prevent the poller from adding the same item shortly after
        dataProvider.refresh();
      }
    }
  });
  context.subscriptions.push(disposable);

  // 2. Poll for external clipboard changes every 2s
  setInterval(async () => {
    try {
      const rawCurrent = await vscode.env.clipboard.readText();
      const current = rawCurrent ? String(rawCurrent).replace(/\r\n/g, '\n') : rawCurrent;
      if (current && current.trim() && current !== lastClipboard) {
        lastClipboard = current;
        const ok = await historyBackend.addToHistory(current);
        if (ok) dataProvider.refresh();
      }
    } catch (err) {
      console.error('[Clipboard Manager] Clipboard poll error:', err.message || err);
    }
  }, 2000);

  console.log('✅ Clipboard Manager activated successfully.');
}

// --------------------------------------------------------------------------
// 🧠 Utility Functions
// --------------------------------------------------------------------------

function ensureHistoryFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify({ slots: {}, pinned: [], history: [] }, null, 2),
        'utf8'
      );
    }
  } catch (error) {
    console.error('[Clipboard Manager] Failed to create history file:', error.message);
  }
}

async function resolveTextArg(arg) {
  if (typeof arg === 'string') return arg.trim();
  if (arg && arg.label) return getItemText(arg);

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    warn('No active editor.');
    return '';
  }
  const text = editor.document.getText(editor.selection);
  return text.trim() ? text : '';
}

function getItemText(item) {
  if (!item) return '';
  // If it's a direct string, return it
  if (typeof item === 'string') return item;
  // If the TreeItem carries a command argument (our provider sets this), prefer that
  // This ensures context-menu actions receive the full original text instead of a truncated description.
  try {
    if (item.command && Array.isArray(item.command.arguments) && item.command.arguments.length) {
      const arg = item.command.arguments[0];
      if (typeof arg === 'string') return arg;
      if (arg && typeof arg === 'object') {
        // if argument is a TreeItem-like object, try to extract its description or label
        if (typeof arg.description === 'string' && arg.description.trim()) return arg.description;
        if (typeof arg.label === 'string' && arg.label.trim()) return String(arg.label).replace(/^\d+\.\s*[^\w\s]?\s*/, '').trim();
      }
    }
  } catch (e) {}

  // If it's a tree item, prefer description over label since label includes index and emoji
  if (item.description) return item.description;
  if (item.label) {
    // Remove index number and emoji from label
    const text = String(item.label).replace(/^\d+\.\s*[^\w\s]?\s*/, '').trim();
    return text;
  }
  return '';
}

function short(text, limit = 40) {
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

function register(context, command, callback) {
  context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

function info(msg) {
  vscode.window.showInformationMessage(`📋 ${msg}`);
}

function warn(msg) {
  vscode.window.showWarningMessage(`⚠️ ${msg}`);
}

function deactivate() {}

module.exports = { activate, deactivate };
