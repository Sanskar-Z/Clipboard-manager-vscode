#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <string>
#include <iostream>
#include <chrono>
#include <thread>
#include "ClipboardMonitor.h"

ClipboardMonitor::ClipboardMonitor() {}
ClipboardMonitor::~ClipboardMonitor() { stop(); }

void ClipboardMonitor::start(Callback onChange) {
    if (m_running) return;
    m_running = true;
    m_callback = onChange;
    m_thread = std::thread([this]() { monitorLoop(); });
}

void ClipboardMonitor::stop() {
    if (!m_running) return;
    m_running = false;
    if (m_thread.joinable()) m_thread.join();
}

bool ClipboardMonitor::isRunning() const { return m_running; }

std::string ClipboardMonitor::readClipboardWindows() {
    if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) return "";
    if (!OpenClipboard(nullptr)) return "";

    std::string out;
    HGLOBAL hData = GetClipboardData(CF_UNICODETEXT);
    if (hData) {
        LPCWSTR pszText = static_cast<LPCWSTR>(GlobalLock(hData));
        if (pszText) {
            int size_needed = WideCharToMultiByte(CP_UTF8, 0, pszText, -1, NULL, 0, NULL, NULL);
            if (size_needed > 0) {
                std::string buffer(size_needed, 0);
                WideCharToMultiByte(CP_UTF8, 0, pszText, -1, &buffer[0], size_needed, NULL, NULL);
                if (!buffer.empty() && buffer.back() == '\0') buffer.pop_back();
                out = buffer;
            }
            GlobalUnlock(hData);
        }
    }
    CloseClipboard();
    return out;
}

void ClipboardMonitor::monitorLoop() {
    std::string last;
    while (m_running) {
        std::string cur = readClipboardWindows();
        if (!cur.empty() && cur != last) {
            last = cur;
            if (m_callback) m_callback(cur);
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }
}
