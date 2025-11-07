// 📜 historyBackend.js
// Core storage and logic for Clipboard Manager

const fs = require('fs');
const path = require('path');
const child = require('child_process');

let HISTORY_FILE = '';
let CLI_PATH = null;
let historyData = {
  slots: {},
  history: [],
  pinned: [],
  // optional flattened list with pinned markers (produced by C++ export)
  all: []
};

// --------------------------------------------------------------------------
// 🏁 Initialization
// --------------------------------------------------------------------------
function init(filePath, cliPath) {
  HISTORY_FILE = filePath;
  CLI_PATH = cliPath || null;

  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      // If CLI exists, try to ask it to export JSON into HISTORY_FILE
      if (CLI_PATH) {
        try {
          runCliSync(['export-json', HISTORY_FILE]);
        } catch (e) {}
      }

      if (!fs.existsSync(HISTORY_FILE)) {
        saveFile(); // Create a fresh file
      }
    } else {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      try {
        historyData = JSON.parse(data);
      } catch {
        console.warn('[Clipboard Manager] ⚠️ Corrupt history file. Reinitializing...');
        historyData = { slots: {}, history: [], pinned: [], all: [] };
        saveFile();
      }
    }
  } catch (err) {
    console.error('[Clipboard Manager] ❌ Failed to load history file:', err.message);
  }
}

// --------------------------------------------------------------------------
// 💾 File Operations
// --------------------------------------------------------------------------
function saveFile() {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyData, null, 2), 'utf8');
  } catch (err) {
    console.error('[Clipboard Manager] ❌ Failed to save history file:', err.message);
  }
}

function runCliSync(args) {
  if (!CLI_PATH) throw new Error('CLI not configured');
  const res = child.spawnSync(CLI_PATH, args, { encoding: 'utf8' });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = res.stderr || res.stdout || `exit ${res.status}`;
    throw new Error(msg);
  }
  return res.stdout;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    if (!CLI_PATH) return reject(new Error('CLI not configured'));
    const proc = child.spawn(CLI_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += String(c); });
    proc.stderr.on('data', (c) => { stderr += String(c); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout || `exit ${code}`));
      resolve(stdout);
    });
  });
}

function hasCli() {
  return !!CLI_PATH;
}

function reload() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return false;
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    historyData = JSON.parse(data);
    return true;
  } catch (err) {
    console.error('[Clipboard Manager] ❌ Failed to reload history file:', err.message);
    return false;
  }
}

// --------------------------------------------------------------------------
// 🧩 Core Clipboard Operations
// --------------------------------------------------------------------------
async function saveToSlot(slot, text) {
  if (!text) return false;
  if (CLI_PATH) {
    // write text to a temp file and call CLI to avoid shell quoting/length issues
    const os = require('os');
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `cm_slot_${slot}_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    try {
      fs.writeFileSync(tmpPath, text, 'utf8');
      await runCli(['setslot-from-file', String(slot), tmpPath]);
      await reload();
      return true;
    } catch (e) {
      console.error('[Clipboard Manager] CLI setslot failed:', e.message);
      return false;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
  }

  historyData.slots[slot] = text;
  addToHistory(text);
  saveFile();
  return true;
}

function getFromSlot(slot) {
  return historyData.slots[slot] || null;
}

async function addToHistory(text) {
  if (!text || text.trim() === '') return false;
  if (CLI_PATH) {
    // write text to a temp file and call CLI to avoid shell quoting/length issues
    const os = require('os');
    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `cm_add_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
    try {
      fs.writeFileSync(tmpPath, text, 'utf8');
      await runCli(['add-from-file', tmpPath]);
      await reload();
      return true;
    } catch (e) {
      console.error('[Clipboard Manager] CLI add failed:', e.message);
      return false;
    } finally {
      try { fs.unlinkSync(tmpPath); } catch (e) {}
    }
  }

  // 🧹 Remove duplicates in both history and pinned
  historyData.history = historyData.history.filter(item => item !== text);
  historyData.pinned = historyData.pinned.filter(item => item !== text);

  // Add to top of history
  historyData.history.unshift(text);

  // Limit to 100 entries
  if (historyData.history.length > 100) historyData.history.pop();

  saveFile();
  return true;
}

// --------------------------------------------------------------------------
// 📌 Pinning and Deleting
// --------------------------------------------------------------------------
async function pinItem(text) {
  if (!text) return false;
  if (CLI_PATH) {
    try {
      await reload();
      const all = historyData.all || [];
      // Try exact match first
      let item = all.find(it => it && it.content === text);
      // If not found, try trimmed match (handle whitespace differences)
      if (!item) {
        item = all.find(it => it && it.content.trim() === text.trim());
      }
      if (!item) {
        console.error('[Clipboard Manager] Item not found for pin:', text);
        return false;
      }
      const idx = item.index;  // Use the index from C++ backend
      await runCli(['pin', String(idx)]);
      await reload();
      return true;
    } catch (e) {
      console.error('[Clipboard Manager] CLI pin failed:', e.message);
      return false;
    }
  }

  if (historyData.pinned.includes(text)) return false;
  historyData.pinned.push(text);
  historyData.history = historyData.history.filter(item => item !== text);
  saveFile();

  console.log(`[Clipboard Manager] 📌 Pinned "${text}"`);
  return true;
}

async function unpinItem(text) {
  if (!text) return false;
  if (CLI_PATH) {
    try {
      await reload();
      const all = historyData.all || [];
      // Try exact match first
      let item = all.find(it => it && it.content === text);
      // If not found, try trimmed match
      if (!item) {
        item = all.find(it => it && it.content.trim() === text.trim());
      }
      if (!item) {
        console.error('[Clipboard Manager] Item not found for unpin:', text);
        return false;
      }
      const idx = item.index;  // Use the index from C++ backend
      await runCli(['unpin', String(idx)]);
      await reload();
      return true;
    } catch (e) {
      console.error('[Clipboard Manager] CLI unpin failed:', e.message);
      return false;
    }
  }

  if (!historyData.pinned.includes(text)) return false;

  historyData.pinned = historyData.pinned.filter(item => item !== text);
  saveFile();

  console.log(`[Clipboard Manager] 📤 Unpinned "${text}"`);
  return true;
}

async function deleteItem(text) {
  if (!text) return false;
  if (CLI_PATH) {
    try {
      await reload();
      const all = historyData.all || [];
      // Try exact match first
      let item = all.find(it => it && it.content === text);
      // If not found, try trimmed match
      if (!item) {
        item = all.find(it => it && it.content.trim() === text.trim());
      }
      if (!item) {
        console.error('[Clipboard Manager] Item not found for delete:', text);
        return false;
      }
      const idx = item.index;  // Use the index from C++ backend
      await runCli(['delete', String(idx)]);
      await reload();
      console.log(`[Clipboard Manager] 🗑️ Deleted "${text}" successfully.`);
      return true;
    } catch (e) {
      console.error('[Clipboard Manager] CLI delete failed:', e.message);
      return false;
    }
  }

  const beforeHistory = historyData.history.length;
  const beforePinned = historyData.pinned.length;

  historyData.history = historyData.history.filter(item => item !== text);
  historyData.pinned = historyData.pinned.filter(item => item !== text);

  saveFile();

  const changed = beforeHistory !== historyData.history.length || beforePinned !== historyData.pinned.length;

  if (changed) {
    console.log(`[Clipboard Manager] 🗑️ Deleted "${text}" successfully.`);
    return true;
  } else {
    console.warn(`[Clipboard Manager] ⚠️ Item not found for deletion: "${text}".`);
    return false;
  }
}

// --------------------------------------------------------------------------
// 🔍 Search & Getters
// --------------------------------------------------------------------------
function search(query) {
  if (!query) return [...historyData.history];
  const lower = query.toLowerCase();
  return historyData.history.filter(item => item.toLowerCase().includes(lower));
}

function getAll() {
  return {
    slots: { ...historyData.slots },
    history: [...historyData.history],
    pinned: [...historyData.pinned]
  };
}

function reload() {
  try {
    // If CLI exists, ask it to export JSON into HISTORY_FILE synchronously
    if (CLI_PATH) {
      try { runCliSync(['export-json', HISTORY_FILE]); } catch (e) { /* ignore */ }
    }
    if (!fs.existsSync(HISTORY_FILE)) return false;
    const data = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(data);
    historyData.slots = parsed.slots || {};
    historyData.history = parsed.history || [];
    historyData.pinned = parsed.pinned || [];
    historyData.all = parsed.all || [];
    return true;
  } catch (err) {
    console.error('[Clipboard Manager] ❌ Failed to reload history file:', err.message);
    return false;
  }
}

// --------------------------------------------------------------------------
// 📦 Exports
// --------------------------------------------------------------------------
module.exports = {
  init,
  saveToSlot,
  getFromSlot,
  addToHistory,
  pinItem,
  unpinItem,
  deleteItem,
  search,
  getAll,
  reload,
  hasCli
};
