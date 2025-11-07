cmake_minimum_required(VERSION 3.10)
project(Clipboard_Manager)

set(CMAKE_CXX_STANDARD 17)

add_executable(clipboard_manager
    src/main.cpp
    src/history_manager/HistoryManager.cpp
    src/clipboard_monitor/ClipboardMonitor.cpp
    src/cli/CLI.cpp
    src/advanced_features/AdvancedFeatures.cpp
)

target_include_directories(clipboard_manager PRIVATE src)
