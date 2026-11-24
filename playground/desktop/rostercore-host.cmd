@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "ROSTERCORE_RESOURCES=%~dp0resources\native"
set "ROSTERCORE_CLI=%ROSTERCORE_RESOURCES%\bin\rostercore.exe"
"%~dp0RosterCore.exe" "%~dp0resources\app\server.mjs" --headless
