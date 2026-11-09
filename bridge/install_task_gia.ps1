# Install mt5_market.py (MT5 price bridge for the Forex market tab) to run at every Windows logon.
# Same method as install_task.ps1 of mt5_bridge.py: Task Scheduler with normal user rights, fallback = Startup folder.
# Remove: Unregister-ScheduledTask -TaskName "QWS MT5 Market Bridge" -Confirm:$false   (and delete Startup\qws_mt5_market.cmd)
# NOTE: keep this file ASCII-only (Windows PowerShell 5 reads BOM-less files as ANSI).
$ErrorActionPreference = "Stop"
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$py   = Join-Path $dir "..\.venv\Scripts\pythonw.exe"
$scr  = Join-Path $dir "mt5_market.py"
$name = "QWS MT5 Market Bridge"
if (-not (Test-Path $py)) { Write-Host "Missing $py - fix the path to the Python that has MetaTrader5 installed."; exit 1 }
$py = (Resolve-Path $py).Path
try {
  $act = New-ScheduledTaskAction -Execute $py -Argument "`"$scr`"" -WorkingDirectory $dir
  $trg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
         -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -Action $act -Trigger $trg -Settings $set -Description "MT5 prices -> Quang Workspace Forex market tab" -Force | Out-Null
  Start-ScheduledTask -TaskName $name
  Write-Host "OK: Task Scheduler '$name' installed and started."
} catch {
  Write-Host "Task Scheduler failed: $($_.Exception.Message)"
  $startup = [Environment]::GetFolderPath("Startup")
  $cmd = Join-Path $startup "qws_mt5_market.cmd"
  Set-Content -Path $cmd -Encoding ASCII -Value "@start `"`" `"$py`" `"$scr`""
  Start-Process -FilePath $py -ArgumentList "`"$scr`"" -WorkingDirectory $dir
  Write-Host "OK: fallback installed in Startup folder ($cmd) and bridge started."
}
