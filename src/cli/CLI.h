#ifndef CLI_H
#define CLI_H

#include <string>
#include "../history_manager/HistoryManager.h"

class CLI {
public:
    explicit CLI(const std::string &dataDir);
    int runCommandLine(int argc, char** argv);
    void runMenu(); // starts interactive mode

private:
    std::string m_dataDir;
    HistoryManager history;

    // Menu helpers
    void showMenu();
    void addItem();
    void deleteItem();
    void pinItem();
    void unpinItem();
    void undoDelete();
    void showHistory();
    void searchItems();

    // Command-line mode helpers
    void handleCommand(const std::string &cmd);
};

#endif // CLI_H
