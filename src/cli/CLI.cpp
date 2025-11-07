#include <cstdio>
#include <iostream>
#include <string>
#include <filesystem>
#include "CLI.h"
#include <cstring> 

using namespace std;

CLI::CLI(const string &dataDir)
    : m_dataDir(dataDir), history(dataDir) {
    filesystem::create_directories(m_dataDir);
}

int CLI::runCommandLine(int argc, char** argv) {
    if (argc > 1) {
        string command = argv[1];
        handleCommand(command);
        return 0;
    }
    runMenu();
    return 0;
}

void CLI::runMenu() {
    while (true) {
        showMenu();
        int choice;
        printf("\nEnter choice: ");
        if (scanf("%d", &choice) != 1) {
            printf("Invalid input.\n");
            while (getchar() != '\n'); // clear buffer
            continue;
        }
        getchar(); // clear newline

        switch (choice) {
            case 1: addItem(); break;
            case 2: deleteItem(); break;
            case 3: pinItem(); break;
            case 4: unpinItem(); break;
            case 5: undoDelete(); break;
            case 6: showHistory(); break;
            case 7: searchItems(); break;
            case 0: return;
            default: printf("Invalid option!\n");
        }
    }
}

void CLI::showMenu() {
    printf("\n====== Clipboard Manager ======\n");
    printf("1. Add Item\n");
    printf("2. Delete Item\n");
    printf("3. Pin Item\n");
    printf("4. Unpin Item\n");
    printf("5. Undo Delete\n");
    printf("6. Show History\n");
    printf("7. Search Items\n");
    printf("0. Exit\n");
}

void CLI::addItem() {
    char buffer[1024];
    printf("Enter clipboard text: ");
    getchar(); // clear newline
    fgets(buffer, sizeof(buffer), stdin);
    buffer[strcspn(buffer, "\n")] = 0; // remove newline

    history.addItem(string(buffer));
    printf("Added successfully!\n");
}

void CLI::deleteItem() {
    int id;
    printf("Enter ID to delete: ");
    if (scanf("%d", &id) != 1) {
        printf("Invalid input.\n");
        while (getchar() != '\n');
        return;
    }
    getchar();

    if (history.deleteItem(id)) printf("Deleted!\n");
    else printf("ID not found.\n");
}

void CLI::pinItem() {
    int id;
    printf("Enter ID to pin: ");
    if (scanf("%d", &id) != 1) {
        printf("Invalid input.\n");
        while (getchar() != '\n');
        return;
    }
    getchar();

    if (history.pinItem(id)) printf("Pinned!\n");
    else printf("ID not found.\n");
}

void CLI::unpinItem() {
    int id;
    printf("Enter ID to unpin: ");
    if (scanf("%d", &id) != 1) {
        printf("Invalid input.\n");
        while (getchar() != '\n');
        return;
    }
    getchar();

    if (history.unpinItem(id)) printf("Unpinned!\n");
    else printf("ID not found.\n");
}

void CLI::undoDelete() {
    if (history.undoDelete()) printf("Undo successful!\n");
    else printf("Nothing to undo.\n");
}

void CLI::showHistory() {
    auto items = history.readHistory();
    printf("\n--- Clipboard History ---\n");
    int idx = 0;
    for (const auto& item : items) {
        printf("[%d] %s", idx++, item.content.c_str());
        if (item.pinned) printf(" (Pinned)");
        printf("\n");
    }
}

void CLI::searchItems() {
    char keyword[256];
    printf("Enter keyword: ");
    getchar();
    fgets(keyword, sizeof(keyword), stdin);
    keyword[strcspn(keyword, "\n")] = 0;

    auto results = history.search(string(keyword));
    for (const auto& item : results)
        printf("%s - %s\n", item.timestamp.c_str(), item.content.c_str());
}

void CLI::handleCommand(const string &cmd) {
    if (cmd == "history") {
        showHistory();
    } else if (cmd == "undo") {
        undoDelete();
    } else {
        printf("Unknown command: %s\n", cmd.c_str());
    }
}
