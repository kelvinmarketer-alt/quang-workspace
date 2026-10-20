@echo off
rem Go bot khoi may (dung bot, bo khoi Startup). Khong xoa .env va nhat ky.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\uninstall.ps1"
pause
