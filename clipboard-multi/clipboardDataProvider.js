const vscode = require('vscode');

class ClipboardDataProvider {
  constructor(backend) {
    this.backend = backend;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.searchResults = null;
  }

  // 🔄 Force UI reload
  refresh() {
    this._onDidChangeTreeData.fire();
  }

  // 🔍 Handle search query
  search(query) {
    try {
      if (!query || !query.trim()) {
        this.searchResults = null; // Reset to full view
      } else {
        this.searchResults = this.backend.search(query);
      }
      this._onDidChangeTreeData.fire();
    } catch (err) {
      vscode.window.showErrorMessage(`❌ Search failed: ${err.message}`);
    }
  }

  getTreeItem(element) {
    return element;
  }

  // 🌲 Generate tree items
  getChildren() {
    // If we are showing search results
    if (this.searchResults !== null) {
      const results = this.searchResults;
      if (results.length === 0) {
        return [this._createEmptyMessage('No results found for your search')];
      }

      const items = [
        this._createSectionHeader(`🔍 Search Results (${results.length})`),
        this._createSpacer()
      ];

      results.forEach((text, index) => {
        const safeText = this._sanitize(text);
        const item = new vscode.TreeItem(`🧾 ${index + 1}. ${safeText.display}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('search');
        item.contextValue = 'searchResult';
        item.description = safeText.display;
        const lineCount = safeText.original.split(/\r?\n/).length;
        item.tooltip = new vscode.MarkdownString(
          `# 🔍 Search Match ${lineCount > 1 ? `(${lineCount} lines)` : ''}\n` +
          '---\n' +
          '```\n' +
          safeText.original +
          '\n```'
        );
        item.command = {
          command: 'clipboard.pasteItem',
          title: 'Paste Search Result',
          arguments: [text],
        };
        items.push(item);
      });

      items.push(this._createSpacer());
      const exitSearch = new vscode.TreeItem('↩️  Exit Search View');
      exitSearch.command = {
        command: 'clipboard.exitSearch',
        title: 'Exit Search View',
      };
      exitSearch.iconPath = new vscode.ThemeIcon('arrow-left');
      items.push(exitSearch);

      return items;
    }

    // Default full view
    const { slots = {}, pinned = [], history = [] } = this.backend.getAll();
    const items = [];

    // 🧩 --- SLOTS SECTION ---
    items.push(this._createSectionHeader('📂  Slots'));
    const slotEntries = Object.entries(slots);
    if (slotEntries.length) {
      for (const [slot, text] of slotEntries) {
        const safeText = this._sanitize(text);
        const item = new vscode.TreeItem(`🔹 Slot ${slot}: ${safeText.display}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('save-all');
        item.contextValue = 'slot';
        item.description = safeText.display;
        const lineCount = safeText.original.split(/\r?\n/).length;
        item.tooltip = new vscode.MarkdownString(
          `# 📋 Slot ${slot} ${lineCount > 1 ? `(${lineCount} lines)` : ''}\n` +
          '---\n' +
          '```\n' +
          safeText.original +
          '\n```'
        );
        item.command = {
          command: 'clipboard.paste',
          title: 'Paste from Slot',
          arguments: [{ slot }],
        };
        items.push(item);
      }
    } else {
      items.push(this._createEmptyMessage('No saved slots yet'));
    }

    // 📏 Spacer
    items.push(this._createSpacer());

    // 📌 --- PINNED ITEMS SECTION ---
    items.push(this._createSectionHeader('📌  Pinned'));
    if (pinned.length) {
      pinned.forEach((text, index) => {
        const safeText = this._sanitize(text);
        const item = new vscode.TreeItem(`⭐ ${index + 1}. ${safeText.display}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('pin');
        item.contextValue = 'pinnedItem';
        item.description = safeText.display;
        const lineCount = safeText.original.split(/\r?\n/).length;
        item.tooltip = new vscode.MarkdownString(
          `# 📍 Pinned Item ${lineCount > 1 ? `(${lineCount} lines)` : ''}\n` +
          '---\n' +
          '```\n' +
          safeText.original +
          '\n```'
        );
        item.command = {
          command: 'clipboard.pasteItem',
          title: 'Paste Pinned Item',
          arguments: [text],
        };
        items.push(item);
      });
    } else {
      items.push(this._createEmptyMessage('No pinned items yet'));
    }

    // 📏 Spacer
    items.push(this._createSpacer());

    // 🕘 --- HISTORY SECTION ---
    items.push(this._createSectionHeader('🕓  History'));
    const filteredHistory = history.filter((text) => !pinned.includes(text));
    if (filteredHistory.length) {
      filteredHistory.forEach((text, index) => {
        const safeText = this._sanitize(text);
        const item = new vscode.TreeItem(`🧾 ${index + 1}. ${safeText.display}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('history');
        item.contextValue = 'historyItem';
        item.description = safeText.display;
        const lineCount = safeText.original.split(/\r?\n/).length;
        item.tooltip = new vscode.MarkdownString(
          `# 📄 Clipboard Entry ${lineCount > 1 ? `(${lineCount} lines)` : ''}\n` +
          '---\n' +
          '```\n' +
          safeText.original +
          '\n```'
        );
        item.command = {
          command: 'clipboard.pasteItem',
          title: 'Paste History Item',
          arguments: [text],
        };
        items.push(item);
      });
    } else {
      items.push(this._createEmptyMessage('Clipboard history is empty'));
    }

    // ✨ --- EMPTY STATE ---
    if (!slotEntries.length && !pinned.length && !history.length) {
      const empty = new vscode.TreeItem('✨ Clipboard is empty — start copying to begin!');
      empty.iconPath = new vscode.ThemeIcon('info');
      empty.contextValue = 'empty';
      items.push(empty);
    }

    return items;
  }

  // 🧠 --- HELPERS ---
  _sanitize(text) {
    if (!text) return { display: '[Empty]', original: '' };
    
    const originalText = text;
    const lines = text.split(/\r?\n/);
    const lineCount = lines.length;
    
    // Create a preview that shows number of lines if multiline
    let display = lines[0].trim();
    if (lineCount > 1) {
      display = `${display} ... (+${lineCount - 1} more lines)`;
    }
    
    return {
      display: display || '[Empty]',
      original: originalText
    };
  }

  _createSectionHeader(label) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('symbol-namespace');
    item.contextValue = 'section';
    item.tooltip = label.replace(/📂|📌|🕓/g, '').trim();
    item.description = '────────────────────────';
    return item;
  }

  _createEmptyMessage(label) {
    const item = new vscode.TreeItem(`🕳️ ${label}`, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('circle-slash');
    item.contextValue = 'empty';
    return item;
  }

  _createSpacer() {
    const spacer = new vscode.TreeItem(' ');
    spacer.contextValue = 'spacer';
    return spacer;
  }
}

module.exports = ClipboardDataProvider;
