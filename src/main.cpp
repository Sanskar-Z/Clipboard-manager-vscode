#include <iostream>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <filesystem>
#include <windows.h>
#include "cli/CLI.h"
#include "clipboard_monitor/ClipboardMonitor.h"
#include "history_manager/HistoryManager.h"
#include "advanced_features/AdvancedFeatures.h"

namespace fs = std::filesystem;

int main(int argc, char* argv[]) {
    std::string dataDir = "data";  // Folder for storing history and slots
    HistoryManager history(dataDir);
    CLI cli(dataDir);

    if (argc > 1) {
        std::string cmd = argv[1];
        std::vector<std::string> args(argv + 1, argv + argc);

        // ---------- HISTORY COMMAND ----------
        if (cmd == "history") {
            auto items = history.readHistory();
            for (size_t i = 0; i < items.size(); ++i) {
                std::cout << i << ": [" << items[i].timestamp << "] "
                          << (items[i].pinned ? "[PINNED] " : "")
                          << items[i].content << "\n";
            }
            return 0;
        }

        // ---------- SEARCH COMMAND ----------
        else if (cmd == "search" && args.size() >= 2) {
            std::string query = args[1];
            auto results = history.search(query);
            for (const auto& it : results)
                std::cout << "[" << it.timestamp << "] " << it.content << "\n";
            return 0;
        }

        // ---------- PIN COMMAND ----------
        else if (cmd == "pin" && args.size() >= 2) {
            int index = std::stoi(args[1]);
            bool ok = history.pinItem(index);
            if (ok) std::cout << "Item pinned successfully.\n";
            else std::cout << "Failed to pin item.\n";
            return ok ? 0 : 1;
        }

        // ---------- UNPIN COMMAND ----------
        else if (cmd == "unpin" && args.size() >= 2) {
            int index = std::stoi(args[1]);
            bool ok = history.unpinItem(index);
            if (ok) std::cout << "Item unpinned successfully.\n";
            else std::cout << "Failed to unpin item.\n";
            return ok ? 0 : 1;
        }

        // ---------- DELETE COMMAND ----------
        else if (cmd == "delete" && args.size() >= 2) {
            int index = std::stoi(args[1]);
            bool ok = history.deleteItem(index);
            if (ok) std::cout << "Item deleted successfully.\n";
            else std::cout << "Failed to delete item.\n";
            return ok ? 0 : 1;
        }

        // ---------- UNDO COMMAND ----------
        else if (cmd == "undo") {
            bool ok = history.undoDelete();
            if (ok) std::cout << "Undo successful.\n";
            else std::cout << "Nothing to undo.\n";
            return ok ? 0 : 1;
        }

        // ---------- COPY COMMAND ----------
        else if (cmd == "copy" && args.size() >= 3) {
            if (!IsClipboardFormatAvailable(CF_UNICODETEXT))
                return 4;
            if (!OpenClipboard(nullptr))
                return 5;

            std::string value;
            HGLOBAL hData = GetClipboardData(CF_UNICODETEXT);
            if (hData) {
                LPCWSTR pszText = static_cast<LPCWSTR>(GlobalLock(hData));
                if (pszText) {
                    int size_needed = WideCharToMultiByte(CP_UTF8, 0, pszText, -1, NULL, 0, NULL, NULL);
                    std::string buffer(size_needed, '\0');
                    WideCharToMultiByte(CP_UTF8, 0, pszText, -1, &buffer[0], size_needed, NULL, NULL);
                    if (!buffer.empty() && buffer.back() == '\0')
                        buffer.pop_back();
                    value = buffer;
                    GlobalUnlock(hData);
                }
            }
            CloseClipboard();

            int slot = std::stoi(args[2]);
            bool ok = history.setSlot(slot, value);
            if (ok) ok = history.addItem(value);
            return ok ? 0 : 1;
        }

        // ---------- ADD-FROM-FILE COMMAND ----------
        else if (cmd == "add-from-file" && args.size() >= 2) {
            const std::string filePath = args[1];
            std::ifstream in(filePath, std::ios::binary);
            if (!in.is_open()) {
                std::cerr << "Failed to open file: " << filePath << "\n";
                return 2;
            }
            std::ostringstream ss;
            ss << in.rdbuf();
            const std::string text = ss.str();
            bool ok = history.addItem(text);
            if (ok) std::cout << "Added content from " << filePath << "\n";
            else std::cout << "Failed to add content.\n";
            return ok ? 0 : 1;
        }

        // ---------- SETSLOT-FROM-FILE COMMAND ----------
        else if (cmd == "setslot-from-file" && args.size() >= 3) {
            int slot = std::stoi(args[1]);
            const std::string filePath = args[2];
            std::ifstream in(filePath, std::ios::binary);
            if (!in.is_open()) {
                std::cerr << "Failed to open file: " << filePath << "\n";
                return 2;
            }
            std::ostringstream ss;
            ss << in.rdbuf();
            const std::string text = ss.str();
            bool ok = history.setSlot(slot, text);
            if (ok) ok = history.addItem(text);
            if (ok) std::cout << "Set slot " << slot << " from " << filePath << "\n";
            else std::cout << "Failed to set slot.\n";
            return ok ? 0 : 1;
        }

        // ---------- ADD COMMAND ----------
        else if (cmd == "add" && args.size() >= 2) {
            // join remaining args as text
            std::string text;
            for (size_t i = 1; i < args.size(); ++i) {
                if (i > 1) text += " ";
                text += args[i];
            }
            bool ok = history.addItem(text);
            if (ok) std::cout << "Added: " << text << "\n";
            else std::cout << "Failed to add item.\n";
            return ok ? 0 : 1;
        }

        // ---------- SETSLOT COMMAND ----------
        else if (cmd == "setslot" && args.size() >= 3) {
            int slot = std::stoi(args[1]);
            std::string text;
            for (size_t i = 2; i < args.size(); ++i) {
                if (i > 2) text += " ";
                text += args[i];
            }
            bool ok = history.setSlot(slot, text);
            if (ok) std::cout << "Set slot " << slot << " to: " << text << "\n";
            else std::cout << "Failed to set slot.\n";
            return ok ? 0 : 1;
        }

        // ---------- EXPORT JSON ----------
        else if (cmd == "export-json") {
            std::string outPath;
            if (args.size() >= 2) outPath = args[1];
            else outPath = (fs::path(dataDir) / "clipboard_history.json").string();
            bool ok = history.exportJson(outPath);
            if (ok) std::cout << outPath << "\n";
            else std::cout << "Failed to export JSON.\n";
            return ok ? 0 : 1;
        }

        // ---------- GETSLOT COMMAND ----------
        else if (cmd == "getslot" && args.size() >= 2) {
            int slot = std::stoi(args[1]);
            // Use the existing HistoryManager to get slot content
            auto content = history.getSlot(slot);
            if (content.has_value() && !content.value().empty()) {
                std::cout << content.value() << std::endl;
                return 0;
            }
            return 1;
        }

        std::cout << "Unknown command: " << cmd << "\n";
        return 3;
    }

    // --- Interactive mode ---
    ClipboardMonitor monitor;
    monitor.start([&](const std::string &text) {
        history.addItem(text);
    });

    cli.runMenu();
    monitor.stop();

    return 0;
}