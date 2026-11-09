@echo off
rem Cai cau noi GIA MT5 -> Supabase (tab "Thi truong Forex" cua Quang Workspace): tu chay moi lan dang nhap Windows.
rem Dat file nay + install_task_gia.ps1 + mt5_market.py trong C:\mt5-research\bridge (canh mt5_bridge.py). Python = C:\mt5-research\.venv
setlocal
set "DIR=%~dp0"
set "PY=%DIR%..\.venv\Scripts\pythonw.exe"
if not exist "%PY%" (
  echo Khong thay %PY% - sua dong set PY o tren cho dung duong dan Python co cai MetaTrader5.
  pause & exit /b 1
)
"%DIR%..\.venv\Scripts\python.exe" -c "import MetaTrader5" 2>nul || ( echo Thieu thu vien: chay "%DIR%..\.venv\Scripts\pip" install MetaTrader5 & pause & exit /b 1 )
rem schtasks /Create ONLOGON bi tu choi quyen tren may ban (can admin) -> dung PowerShell nhu cai-cau-noi.bat cua cau noi EA
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%install_task_gia.ps1"
echo.
echo Xong. Mo MT5 (da dang nhap IC Markets). Vai giay sau tab Thi truong Forex co gia.
echo Xem log: chay thu "%DIR%..\.venv\Scripts\python.exe" "%DIR%mt5_market.py" trong cua so cmd.
pause
