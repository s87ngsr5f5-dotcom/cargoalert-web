@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在啟動 CargoAlert v3.0 雙感知器與貨車配置模型網站（支援藍牙直連 ESP32）...
start "" "http://localhost:8787/"
node preview-server.mjs
pause
