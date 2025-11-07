#pragma once
#include "../../include/Item.h"
#include <stack>
#include <vector>
#include <unordered_map>
#include <iostream>

class AdvancedFeatures {
public:
    void addForUndo(const ClipboardItem& item);
    ClipboardItem undo();
    void buildSearchIndex(const std::vector<ClipboardItem>& items);
    void search(const std::string& keyword) const;

private:
    std::stack<ClipboardItem> undoStack;
    std::unordered_map<std::string, ClipboardItem> searchMap;
};
