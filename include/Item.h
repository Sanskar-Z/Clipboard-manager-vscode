#pragma once
#include <string>

enum class ItemType { Text = 0 };

struct ClipboardItem {
    int id;
    ItemType type;
    bool pinned;
    std::string content;

    ClipboardItem(int _id = 0, ItemType _type = ItemType::Text, bool _pinned = false, const std::string& _content = "")
        : id(_id), type(_type), pinned(_pinned), content(_content) {}
};
