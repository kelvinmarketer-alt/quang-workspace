# Cai bot giao dich Quang Workspace len may Windows (KHONG can quyen Administrator).
# Bot tu chay moi khi Windows DANG NHAP (thu muc Startup cua tai khoan nay) va tu chay lai neu bi thoat.
$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $PSScriptRoot
Set-Location $Dir
function Ok($m) { Write-Host "  [OK] $m" -ForegroundColor Green }
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
Write-Host "CAI DAT BOT GIAO DICH QUANG WORKSPACE" -ForegroundColor Cyan
Write-Host "Thu muc bot: $Dir"

# 1) Node.js >= 22
Step "1/5 Kiem tra Node.js"
function Find-Node {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) { if (Test-Path $p) { return $p } }
  return $null
}
$node = Find-Node
$ver = 0
if ($node) { $ver = [int](((& $node -v) -replace "v", "").Split(".")[0]) }
if (-not $node -or $ver -lt 22) {
  Warn "Chua co Node.js 22+ -> dang cai bang winget (can Internet, 1-2 phut). Neu Windows hoi quyen, bam Yes."
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  $node = Find-Node
  if (-not $node) { throw "Khong cai duoc Node.js tu dong. Tai ban LTS o https://nodejs.org roi bam lai cai-dat-windows.bat" }
  $ver = [int](((& $node -v) -replace "v", "").Split(".")[0])
  if ($ver -lt 22) { throw "Node.js $ver qua cu, can 22 tro len. Cai ban LTS o https://nodejs.org" }
}
Ok "Node.js $(& $node -v) tai $node"

# 2) File .env (khoa API) - ban TU dien
Step "2/5 Cau hinh khoa API (.env)"
if (-not (Test-Path "$Dir\.env")) {
  Copy-Item "$Dir\.env.example" "$Dir\.env"
  Warn "Da tao file .env - Notepad se mo: dien SUPABASE_SERVICE_KEY (Supabase > Project Settings > API > service_role), LUU roi DONG Notepad. Khoa Binance nhap trong APP (Coin > Bot that > Cai dat)."
}
$envText = Get-Content "$Dir\.env" -Raw
if ($envText -notmatch "(?m)^SUPABASE_SERVICE_KEY=\S+") {
  Start-Process notepad.exe "$Dir\.env" -Wait
  $envText = Get-Content "$Dir\.env" -Raw
}
if ($envText -notmatch "(?m)^SUPABASE_SERVICE_KEY=\S+") { throw "File .env van thieu SUPABASE_SERVICE_KEY. Dien xong bam lai cai-dat-windows.bat" }
if ($envText -match "(?m)^MODE=live") { Warn "MODE=live = TIEN THAT. Bot chi chay khi co them dong I_UNDERSTAND_REAL_MONEY=1" }
Ok "Da co ket noi app (Supabase). Khoa Binance + che do Testnet/Tien that chinh trong APP: Coin > Bot that > Cai dat"

# 3) Kiem tra ket noi (khong dat lenh)
Step "3/5 Kiem tra ket noi Binance + Supabase (khong dat lenh)"
& $node --env-file="$Dir\.env" "$Dir\check.js"
$ans = Read-Host "Cac dong tren deu OK? Go Y de tiep tuc, phim khac de dung"
if ($ans -notmatch "^[Yy]") { throw "Da dung theo lua chon cua ban. Sua .env roi bam lai cai-dat-windows.bat" }

# 4) File chay bot: tu chay lai neu bot thoat, ghi nhat ky data\bot.log (xoay vong khi > 10MB)
Step "4/5 Tao file chay bot"
New-Item -ItemType Directory -Force -Path "$Dir\data" | Out-Null
$run = @"
@echo off
title QWS Bot giao dich - dung tat cua so nay
cd /d "$Dir"
:loop
for %%A in (data\bot.log) do if %%~zA GTR 10000000 move /y data\bot.log data\bot.old.log >nul
"$node" --env-file=.env bot.js >> data\bot.log 2>&1
timeout /t 15 /nobreak >nul
goto loop
"@
Set-Content -Path "$Dir\windows\run-bot.cmd" -Value $run -Encoding ASCII
Ok "windows\run-bot.cmd"

# 5) Tu chay khi Windows dang nhap: dat loi tat (cua so thu nho) vao thu muc Startup cua tai khoan nay
Step "5/5 Tu chay khi Windows dang nhap"
$startup = [Environment]::GetFolderPath("Startup")
$lnk = Join-Path $startup "QWS Bot giao dich.lnk"
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = "$Dir\windows\run-bot.cmd"
$sc.WorkingDirectory = $Dir
$sc.WindowStyle = 7
$sc.Save()
Ok "Da them vao Startup: $lnk"
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "bot\.js" }
if (-not $running) { Start-Process -FilePath "$Dir\windows\run-bot.cmd" -WorkingDirectory $Dir -WindowStyle Minimized; Ok "Bot da CHAY (cua so thu nho tren thanh Taskbar - dung tat no)" } else { Ok "Bot dang chay san" }

Start-Sleep -Seconds 8
Write-Host "`n===== XONG =====" -ForegroundColor Green
if (Test-Path "$Dir\data\bot.log") { Get-Content "$Dir\data\bot.log" -Tail 15 -Encoding UTF8 }
Write-Host "`nViec nen lam them (xem README phan 'May ban 24/7'):"
Write-Host " 1. Settings > System > Power: Sleep = Never (khi cam dien)."
Write-Host " 2. Bat tu dang nhap Windows (netplwiz) de mat dien bat lai may la bot tu chay."
Write-Host " 3. BIOS: 'Restore on AC Power Loss' = Power On de co dien lai may tu bat."
Write-Host "- Xem nhat ky: bam xem-log.bat  |  Theo doi / Dung bot: app > Coin > Bot that  |  Go bot: go-cai-dat.bat"
