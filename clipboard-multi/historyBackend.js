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
  all: [],
  // store last deleted item for undo
  lastDeleted: null
};

// In-memory guard to avoid saving the same clipboard text multiple times
// when a single Ctrl+C triggers multiple handlers (not persisted to disk)
let _lastAddedText = null;
let _lastAddedAt = 0;

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
        historyData = { slots: {}, history: [], pinned: [], all: [], lastDeleted: null };
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

// Rebuild the flattened `all` array from pinned + history for JS-only mode
function rebuildAll() {
  const all = [];
  let idx = 0;
  // pinned first (preserve order)
  for (const p of historyData.pinned || []) {
    all.push({ index: idx++, content: p });
  }
  // then history
  for (const h of historyData.history || []) {
    all.push({ index: idx++, content: h });
  }
  historyData.all = all;
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
  // Normalize newlines to \n so saved entries use a consistent linebreak format
  try { text = String(text).replace(/\r\n/g, '\n'); } catch (e) {}
  // Deduplicate rapid duplicate adds (e.g., copy handler + poller race)
  try {
    const now = Date.now();
    if (_lastAddedText === text && (now - _lastAddedAt) < 2000) {
      // ignore duplicate adds within 2 seconds
      return false;
    }
  } catch (e) {}
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

  // record last added and persist
  _lastAddedText = text;
  _lastAddedAt = Date.now();

  // rebuild flattened 'all' and persist
  rebuildAll();
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
  rebuildAll();
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
  rebuildAll();
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
      historyData.lastDeleted = text;
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
  historyData.lastDeleted = text;

  rebuildAll();
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

async function undoDelete() {
  if (!historyData.lastDeleted) {
    console.warn('[Clipboard Manager] ⚠️ No item to undo delete.');
    return false;
  }

  const text = historyData.lastDeleted;
  historyData.lastDeleted = null;

  if (CLI_PATH) {
    try {
      // write text to a temp file and call CLI to avoid shell quoting/length issues
      const os = require('os');
      const tmpDir = os.tmpdir();
      const tmpPath = path.join(tmpDir, `cm_undo_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`);
      try {
        fs.writeFileSync(tmpPath, text, 'utf8');
        await runCli(['add-from-file', tmpPath]);
        await reload();
        console.log(`[Clipboard Manager] ↩️ Restored "${text}" successfully.`);
        return true;
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) {}
      }
    } catch (e) {
      console.error('[Clipboard Manager] ❌ Failed to undo delete:', e.message);
      return false;
    }
  }

  historyData.history.unshift(text);
  saveFile();
  console.log(`[Clipboard Manager] ↩️ Restored "${text}" successfully.`);
  return true;
}

// --------------------------------------------------------------------------
// 🧹 Clear all history
// --------------------------------------------------------------------------
async function clearHistory() {
  try {
    if (CLI_PATH) {
      await reload();
      const all = historyData.all || [];
      const indices = all.map(i => i && i.index).filter(i => typeof i === 'number').sort((a, b) => b - a);
      for (const idx of indices) {
        try {
          await runCli(['delete', String(idx)]);
        } catch (e) {
          console.warn('[Clipboard Manager] Failed to delete index', idx, e && e.message ? e.message : e);
        }
      }
      await reload();
      historyData.lastDeleted = null;
      saveFile();
      console.log('[Clipboard Manager] 🧹 Cleared all history via CLI.');
      return true;
    }

    historyData.history = [];
    historyData.pinned = [];
    historyData.all = [];
    historyData.lastDeleted = null;
  rebuildAll();
  saveFile();
    console.log('[Clipboard Manager] 🧹 Cleared all history (JS mode).');
    return true;
  } catch (err) {
    console.error('[Clipboard Manager] ❌ Failed to clear history:', err && err.message ? err.message : err);
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
    // Normalize newline formats when loading so internal representation uses \n
    historyData.slots = {};
    if (parsed.slots) {
      for (const k of Object.keys(parsed.slots)) {
        try {
          historyData.slots[k] = String(parsed.slots[k]).replace(/\r\n/g, '\n');
        } catch (e) {
          historyData.slots[k] = parsed.slots[k];
        }
      }
    }
    historyData.history = (parsed.history || []).map(s => String(s).replace(/\r\n/g, '\n'));
    historyData.pinned = (parsed.pinned || []).map(s => String(s).replace(/\r\n/g, '\n'));
    historyData.all = (parsed.all || []).map(a => ({ index: a && a.index, content: String((a && a.content) || '').replace(/\r\n/g, '\n') }));
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
  hasCli,
  undoDelete
  ,
  clearHistory
};
