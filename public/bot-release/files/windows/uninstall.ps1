# Go bot khoi may: dung bot + bo khoi Startup. Giu nguyen .env, nhat ky, trang thai (data\).
# Lenh/vi the dang mo tren Binance VAN giu SL/TP.
$lnk = Join-Path ([Environment]::GetFolderPath("Startup")) "QWS Bot giao dich.lnk"
if (Test-Path $lnk) { Remove-Item $lnk -Force }
Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { $_.CommandLine -match "run-bot\.cmd" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "bot\.js" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Da dung bot va bo khoi Startup." -ForegroundColor Green
Write-Host "Lenh/vi the dang mo tren Binance van con (co SL/TP). Lenh CHO chua khop thi vao Binance huy tay neu muon."
