#include "AdvancedFeatures.h"
#include <cstdio>

void AdvancedFeatures::addForUndo(const ClipboardItem& item) {
    undoStack.push(item);
}

ClipboardItem AdvancedFeatures::undo() {
    if (undoStack.empty()) {
        printf("Undo stack is empty!\n");
        return ClipboardItem();
    }
    ClipboardItem last = undoStack.top();
    undoStack.pop();
    printf("Undo: Removed item -> %s\n", last.content.c_str());
    return last;
}

void AdvancedFeatures::buildSearchIndex(const std::vector<ClipboardItem>& items) {
    searchMap.clear();
    for (const auto& item : items) {
        searchMap[item.content] = item;
    }
}

void AdvancedFeatures::search(const std::string& keyword) const {
    bool found = false;
    for (const auto& [content, item] : searchMap) {
        if (content.find(keyword) != std::string::npos) {
            printf("Found: [%d] %s\n", item.id, item.content.c_str());
            found = true;
        }
    }
    if (!found)
        printf("No match found for: %s\n", keyword.c_str());
}
