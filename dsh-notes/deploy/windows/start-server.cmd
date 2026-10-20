@echo off
rem Start the notes server on Windows. Paste/adjust the paths for your host.
chcp 65001 >nul
setlocal
set "NODE_EXE=node"
set "APP_DIR=%~dp0..\.."
set "DATA_DIR=C:\ProgramData\dsh-notes"
if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\logs" mkdir "%DATA_DIR%\logs"

"%NODE_EXE%" "%APP_DIR%\server\bin.js" serve ^
  --data-dir "%DATA_DIR%" ^
  --host 127.0.0.1 ^
  --port 8787 ^
  --log-level info ^
  --log-file "%DATA_DIR%\logs\server.log" ^
  %*

exit /b %errorlevel%
