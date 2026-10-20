@echo off
rem Bam dup 1 lan de cai bot (khong can quyen Administrator)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\install.ps1"
pause
