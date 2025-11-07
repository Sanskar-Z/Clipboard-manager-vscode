#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include <fstream>
#include <shlobj.h>

const int NUM_SLOTS = 10;
const int ID_SAVE_START = 100; 
const int ID_PASTE_START = 200;  
const wchar_t APP_DATA_FOLDER[] = L"Clipboard Manager";
const wchar_t HISTORY_FILE_NAME[] = L"clipboard_manager_history.txt";
const std::wstring DELIMITER = L"\n---CLIP_DELIMITER---\n";

extern std::wstring dedicated_clips[NUM_SLOTS];

LRESULT CALLBACK WindowProc(HWND hWnd, UINT uMsg, WPARAM wParam, LPARAM lParam);

void InitializeHotkeys(HWND hWnd);
void UninitializeHotkeys(HWND hWnd);
void SaveToDedicatedSlot(int slot_index);
void PasteFromDedicatedSlot(int slot_index);

std::wstring GetClipboardText();
void SetClipboardText(const std::wstring& text);
void SimulatePaste();

std::wstring GetHistoryFilePath();
void load_history();
void save_history();