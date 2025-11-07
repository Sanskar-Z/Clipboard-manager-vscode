#include "clipboard_manager.h"
#include <algorithm>
#include <shlwapi.h>

// Define the dedicated clips array
std::wstring dedicated_clips[NUM_SLOTS];

void InitializeHotkeys(HWND hWnd) {
    // Ctrl + 0 to 9 for SAVING
    for (int i = 0; i < NUM_SLOTS; ++i) {
        RegisterHotKey(hWnd, ID_SAVE_START + i, MOD_CONTROL, 0x30 + i);
    }
    // Alt + 0 to 9 for PASTING
    for (int i = 0; i < NUM_SLOTS; ++i) {
        RegisterHotKey(hWnd, ID_PASTE_START + i, MOD_ALT, 0x30 + i);
    }
}

void UninitializeHotkeys(HWND hWnd) {
    for (int i = 0; i < NUM_SLOTS; ++i) {
        UnregisterHotKey(hWnd, ID_SAVE_START + i);
        UnregisterHotKey(hWnd, ID_PASTE_START + i);
    }
}

void SaveToDedicatedSlot(int slot_index) {
    dedicated_clips[slot_index] = GetClipboardText();
}

void PasteFromDedicatedSlot(int slot_index) {
    SetClipboardText(dedicated_clips[slot_index]);
}

std::wstring GetClipboardText() {
    if (!OpenClipboard(NULL)) return L"";
    HANDLE hData = GetClipboardData(CF_UNICODETEXT); 
    std::wstring text;
    if (hData != NULL) {
        wchar_t* pszText = static_cast<wchar_t*>(GlobalLock(hData));
        if (pszText != NULL) {
            text = pszText;
            GlobalUnlock(hData);
        }
    }
    CloseClipboard();
    return text;
}

void SetClipboardText(const std::wstring& text) {
    if (!OpenClipboard(NULL)) return;
    EmptyClipboard();
    
    size_t size = (text.length() + 1) * sizeof(wchar_t); 
    HGLOBAL hGlobal = GlobalAlloc(GMEM_MOVEABLE, size);
    if (hGlobal != NULL) {
        LPWSTR lpData = (LPWSTR)GlobalLock(hGlobal);
        if (lpData != NULL) {
            memcpy(lpData, text.c_str(), size);
            GlobalUnlock(hGlobal);
            SetClipboardData(CF_UNICODETEXT, hGlobal);
        } else {
            GlobalFree(hGlobal);
        }
    }
    CloseClipboard();
}

void SimulatePaste() {
    INPUT inputs[4] = { 0 };
    inputs[0].type = inputs[1].type = inputs[2].type = inputs[3].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;
    inputs[1].ki.wVk = 'V';
    inputs[2].ki.wVk = 'V'; inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;
    inputs[3].ki.wVk = VK_CONTROL; inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

    SendInput(4, inputs, sizeof(INPUT));
}