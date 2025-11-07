#ifndef CLIPBOARD_MONITOR_H
#define CLIPBOARD_MONITOR_H

#include <string>
#include <functional>
#include <atomic>
#include <thread>

class ClipboardMonitor {
public:
    using Callback = std::function<void(const std::string&)>;

    ClipboardMonitor();
    ~ClipboardMonitor();

    void start(Callback onChange);
    void stop();
    bool isRunning() const;

private:
    std::atomic<bool> m_running{false};
    std::thread m_thread;
    Callback m_callback;

    void monitorLoop();
    std::string readClipboardWindows();
};

#endif // CLIPBOARD_MONITOR_H
