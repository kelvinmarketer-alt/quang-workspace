@echo off
rem Xem nhat ky bot dang chay (Ctrl+C de thoat)
cd /d "%~dp0"
powershell -NoProfile -Command "Get-Content -Path 'data\bot.log' -Tail 60 -Wait -Encoding UTF8"
