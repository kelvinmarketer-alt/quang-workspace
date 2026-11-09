@echo off
rem Cai cau noi GIA MT5 -> Supabase (tab "Thi truong Forex" cua Quang Workspace): tu chay moi lan dang nhap Windows.
rem Dat file nay + mt5_market.py trong C:\mt5-research\bridge (canh mt5_bridge.py). Python = C:\mt5-research\.venv
setlocal
set "DIR=%~dp0"
set "PY=%DIR%..\.venv\Scripts\pythonw.exe"
if not exist "%PY%" (
  echo Khong thay %PY% - sua dong set PY o tren cho dung duong dan Python co cai MetaTrader5.
  pause & exit /b 1
)
"%DIR%..\.venv\Scripts\python.exe" -c "import MetaTrader5" 2>nul || ( echo Thieu thu vien: chay "%DIR%..\.venv\Scripts\pip" install MetaTrader5 & pause & exit /b 1 )
schtasks /Create /SC ONLOGON /TN "QWS MT5 Market Bridge" /TR "\"%PY%\" \"%DIR%mt5_market.py\"" /F
schtasks /Run /TN "QWS MT5 Market Bridge"
echo Xong. Mo MT5 (da dang nhap IC Markets). Vai giay sau tab Thi truong Forex co gia.
echo Xem log: chay thu "%DIR%..\.venv\Scripts\python.exe" "%DIR%mt5_market.py" trong cua so cmd.
pause
