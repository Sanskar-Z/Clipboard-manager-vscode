# 📋 Clipboard Manager for VS Code

A lightweight Clipboard Manager for Visual Studio Code. It combines a small VS Code extension (frontend) with a C++ backend executable (`clipboard_manager.exe`) that performs system-level clipboard tasks.

Key pieces:
- `clipboard-multi/` — the VS Code extension (JavaScript) and webview UI.
- `src/` and `include/` — the C++ backend source and headers used to build `clipboard_manager.exe`.

---

## ⚙️ Build the C++ Backend (Windows)

You can build the backend manually with `g++` (MinGW or MSYS2) or use CMake.

Manual g++ build (example):

```bash
g++ -std=c++17 src/main.cpp src/cli/CLI.cpp src/history_manager/HistoryManager.cpp src/advanced_features/AdvancedFeatures.cpp src/clipboard_monitor/ClipboardMonitor.cpp -Iinclude -lole32 -luuid -luser32 -o clipboard_manager.exe
```

Or use the included VS Code task (works if you have `g++` on PATH):

1. Open the Command Palette (Ctrl+Shift+P)
2. Run `Tasks: Run Task` → select `build clipboard manager`

Running the executable:

```cmd
.\clipboard_manager.exe
```

If you prefer CMake, generate a build directory and build normally (CMake + Ninja/MSBuild):

```bash
cmake -S . -B build -G "Ninja"
cmake --build build
```

---

## ▶️ Using the VS Code Extension (development)

Open the `clipboard-multi/` folder in VS Code and press F5 to launch the extension host in a new window. Then open the Command Palette (Ctrl+Shift+P) and run:

`Clipboard Manager: Show History`

The extension lets you view/pin/search clipboard entries, quick-copy (Ctrl+0–9) and quick-paste (Alt+0–9), delete entries, and undo.

The extension UI reads/writes the `data/` files under `clipboard-multi/data/` while developing. Those files are ignored by `.gitignore`.

---

## Project layout (important paths)

- `src/` — C++ backend implementation
- `include/` — headers (third-party headers such as `nlohmann/json.hpp` live here)
- `clipboard-multi/` — VS Code extension and webview UI
- `data/` — runtime clipboard history and slot files (ignored)

---

## Contributing

- Use the VS Code task `build clipboard manager` to build the backend on Windows.
- Run the extension by opening `clipboard-multi/` and pressing F5.
- Please open PRs against the `main` branch. Keep changes small and add tests where possible.

---

## License

This project is provided under the MIT License. See `LICENSE` if included.

---

If you'd like, I can also:
- add a small build script for Windows (.bat) to simplify building with MinGW/MSYS2,
- or add a `CMakePresets.json` entry for common build configurations.
Tell me which you'd prefer.