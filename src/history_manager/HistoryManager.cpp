#include "HistoryManager.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <iostream>
#include <nlohmann/json.hpp> // used to export JSON snapshot for extension

namespace fs = std::filesystem;

HistoryManager::HistoryManager(const std::string &data_dir)
    : m_dataDir(data_dir) {
    if (!fs::exists(m_dataDir)) fs::create_directories(m_dataDir);
    m_historyPath = (fs::path(m_dataDir) / "history.txt").string();
    m_lastDeletedPath = (fs::path(m_dataDir) / ".clipboard_last_deleted.txt").string();
    // Ensure slot directory
    if (!fs::exists(fs::path(m_dataDir) / "slots")) {
        fs::create_directories(fs::path(m_dataDir) / "slots");
    }
}

static std::string now_iso8601() {
    auto t = std::chrono::system_clock::now();
    auto tt = std::chrono::system_clock::to_time_t(t);
    std::tm tm;
    localtime_s(&tm, &tt);
    std::ostringstream ss;
    ss << std::put_time(&tm, "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

std::vector<HistoryItem> HistoryManager::readHistory() {
    std::vector<HistoryItem> out;
    std::ifstream in(m_historyPath);
    if (!in.is_open()) return out;
    std::string line;
    while (std::getline(in, line)) {
        // Format: TIMESTAMP ||| CONTENT (safe split)
        auto sep = line.find(" ||| ");
        if (sep != std::string::npos) {
            HistoryItem it;
            it.timestamp = line.substr(0, sep);
            it.content = line.substr(sep + 5);
            // pinned marker: if content begins with [PINNED]
            if (it.content.rfind("[PINNED]", 0) == 0) {
                it.pinned = true;
                it.content = it.content.substr(8);
            }
            out.push_back(it);
        } else {
            // Fallback: treat full line as content
            HistoryItem it;
            it.timestamp = "";
            it.content = line;
            out.push_back(it);
        }
    }
    return out;
}

bool HistoryManager::writeHistory(const std::vector<HistoryItem>& items) {
    std::ofstream out(m_historyPath, std::ios::trunc);
    if (!out.is_open()) return false;
    for (const auto &it : items) {
        std::string content = it.content;
        if (it.pinned) content = std::string("[PINNED]") + content;
        out << it.timestamp << " ||| " << content << "\n";
    }
    bool ok = true;
    // After writing the canonical text history, also write a JSON snapshot so the JS extension can consume it
    try {
        // prefer writing to m_dataDir/clipboard_history.json
        std::string jsonPath = (std::filesystem::path(m_dataDir) / "clipboard_history.json").string();
        exportJson(jsonPath);
    } catch (...) {
        // ignore json export errors here
    }
    return ok;
}

bool HistoryManager::addItem(const std::string &text) {
    auto items = readHistory();
    HistoryItem it;
    it.timestamp = now_iso8601();
    it.content = text;
    it.pinned = false;
    items.insert(items.begin(), it); // newest at front
    return writeHistory(items);
}

bool HistoryManager::deleteItem(size_t index) {
    auto items = readHistory();
    if (index >= items.size()) return false;
    auto deleted = items[index];
    // remove that item
    items.erase(items.begin() + index);
    if (!writeHistory(items)) return false;
    saveLastDeleted(deleted);
    return true;
}

bool HistoryManager::pinItem(size_t index) {
    auto items = readHistory();
    if (index >= items.size()) return false;
    items[index].pinned = true;
    return writeHistory(items);
}

bool HistoryManager::unpinItem(size_t index) {
    auto items = readHistory();
    if (index >= items.size()) return false;
    items[index].pinned = false;
    return writeHistory(items);
}

bool HistoryManager::saveLastDeleted(const HistoryItem &it) {
    std::ofstream out(m_lastDeletedPath, std::ios::trunc);
    if (!out.is_open()) return false;
    out << it.timestamp << "\n";
    out << it.content << "\n";
    out << (it.pinned ? "1" : "0") << "\n";
    return true;
}

std::optional<HistoryItem> HistoryManager::loadLastDeleted() {
    std::ifstream in(m_lastDeletedPath);
    if (!in.is_open()) return std::nullopt;
    HistoryItem it;
    if (!std::getline(in, it.timestamp)) return std::nullopt;
    if (!std::getline(in, it.content)) return std::nullopt;
    std::string pin;
    if (!std::getline(in, pin)) return std::nullopt;
    it.pinned = (pin == "1");
    return it;
}

bool HistoryManager::undoDelete() {
    auto maybe = loadLastDeleted();
    if (!maybe.has_value()) return false;
    auto it = maybe.value();
    auto items = readHistory();
    items.insert(items.begin(), it);
    bool ok = writeHistory(items);
    if (ok) {
        // remove lastDeleted
        std::error_code ec;
        fs::remove(m_lastDeletedPath, ec);
    }
    return ok;
}

std::string HistoryManager::historyFilePath() const {
    return m_historyPath;
}

std::string HistoryManager::slotFilePath(int slot) const {
    std::ostringstream ss;
    ss << (fs::path(m_dataDir) / "slots" / ("slot_" + std::to_string(slot) + ".txt")).string();
    return ss.str();
}

bool HistoryManager::setSlot(int slot, const std::string &text) {
    if (slot < 0 || slot > 9) return false;
    auto path = slotFilePath(slot);
    std::ofstream out(path, std::ios::trunc | std::ios::binary);
    if (!out.is_open()) return false;
    out << text;

    // update JSON snapshot as well
    try {
        std::string jsonPath = (std::filesystem::path(m_dataDir) / "clipboard_history.json").string();
        exportJson(jsonPath);
    } catch (...) {}
    return true;
}

std::optional<std::string> HistoryManager::getSlot(int slot) {
    if (slot < 0 || slot > 9) return std::nullopt;
    auto path = slotFilePath(slot);
    std::ifstream in(path, std::ios::binary);
    if (!in.is_open()) return std::nullopt;
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

std::vector<HistoryItem> HistoryManager::search(const std::string &keyword) {
    auto items = readHistory();
    std::vector<HistoryItem> results;
    for (auto &it : items) {
        if (it.content.find(keyword) != std::string::npos)
            results.push_back(it);
    }
    return results;
}

bool HistoryManager::exportJson(const std::string &outPath) const {
    using json = nlohmann::json;

    json j;
    // slots
    json slots = json::object();
    for (int i = 0; i <= 9; ++i) {
        auto path = slotFilePath(i);
        std::ifstream in(path, std::ios::binary);
        if (!in.is_open()) continue;
        std::ostringstream ss;
        ss << in.rdbuf();
        slots[std::to_string(i)] = ss.str();
    }

    // history + pinned
    auto items = const_cast<HistoryManager*>(this)->readHistory();
    json pinned = json::array();
    json history = json::array();
    for (const auto &it : items) {
        if (it.pinned) pinned.push_back(it.content);
        else history.push_back(it.content);
    }

    // also produce a flattened 'all' array with metadata so consumers can map indices
    json all = json::array();
    for (size_t i = 0; i < items.size(); ++i) {
        const auto &it = items[i];
        json obj;
        obj["content"] = it.content;
        obj["pinned"] = it.pinned;
        obj["timestamp"] = it.timestamp;
        obj["index"] = i;  // Add index for direct lookup
        all.push_back(obj);
    }

    j["slots"] = slots;
    j["pinned"] = pinned;
    j["history"] = history;
    j["all"] = all;

    try {
        std::ofstream out(outPath, std::ios::trunc);
        if (!out.is_open()) return false;
        out << j.dump(2);
    } catch (...) {
        return false;
    }

    return true;
}
