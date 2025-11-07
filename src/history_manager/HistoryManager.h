#ifndef HISTORY_MANAGER_H
#define HISTORY_MANAGER_H

#include <string>
#include <vector>
#include <optional>

struct HistoryItem {
    std::string timestamp;
    std::string content;
    bool pinned = false;
};

class HistoryManager {
public:
    HistoryManager(const std::string &data_dir);

    // High-level operations
    std::vector<HistoryItem> readHistory();               // read history.txt
    bool writeHistory(const std::vector<HistoryItem>&);   // overwrite history.txt
    bool addItem(const std::string &text);                // prepend new item
    bool deleteItem(size_t index);                        // delete by index (0 = latest)
    bool pinItem(size_t index);
    bool unpinItem(size_t index);
    bool undoDelete();                                    // simple undo support

    // Slots (0-9) operations stored in files slots/slot_<n>.txt
    bool setSlot(int slot, const std::string &text);
    std::optional<std::string> getSlot(int slot);

    std::string historyFilePath() const;
    std::string slotFilePath(int slot) const;
    std::vector<HistoryItem> search(const std::string &keyword); // search history items by keyword
    // Export current state as JSON snapshot (slots, pinned, history)
    bool exportJson(const std::string &outPath) const;

private:
    std::string m_dataDir;
    std::string m_historyPath;
    std::string m_lastDeletedPath;
    bool saveLastDeleted(const HistoryItem &it);
    std::optional<HistoryItem> loadLastDeleted();
};

#endif // HISTORY_MANAGER_H
