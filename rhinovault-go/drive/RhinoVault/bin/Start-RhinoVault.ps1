<#
.SYNOPSIS
  Starts RhinoVault Go from this drive: the offline library (kiwix-serve) and the
  launcher/manuals/maps web server (static-web-server), then opens the browser.

.PARAMETER Share
  Make RhinoVault reachable from other devices on the same network (binds 0.0.0.0).

.PARAMETER NoBrowser
  Don't open a browser window.

.PARAMETER NoAI
  Don't start the offline AI assistant (saves memory on older computers).

  Works with Windows PowerShell 5.1 and PowerShell 7.
#>
[CmdletBinding()]
param(
  [switch]$Share,
  [switch]$NoBrowser,
  [switch]$NoAI,
  [int]$WebPort = 8088,
  [int]$LibraryPort = 8090,
  [int]$AiPort = 8091
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path   # drive root
$Bin = Join-Path $PSScriptRoot 'windows-x64'
$LogDir = Join-Path $env:TEMP 'RhinoVaultGo'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Banner {
  Write-Host ''
  Write-Host '  ==============================================' -ForegroundColor DarkYellow
  Write-Host '     RhinoVault Go  -  offline survival library' -ForegroundColor Yellow
  Write-Host '  ==============================================' -ForegroundColor DarkYellow
  Write-Host ''
}

function Test-PortFree([int]$Port) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}

function Get-FreePort([int]$Preferred) {
  for ($p = $Preferred; $p -lt $Preferred + 50; $p++) { if (Test-PortFree $p) { return $p } }
  throw "No free TCP port found near $Preferred."
}

Write-Banner

$sws = Join-Path $Bin 'static-web-server.exe'
$kiwix = Join-Path $Bin 'kiwix-serve.exe'
foreach ($exe in @($sws, $kiwix)) {
  if (-not (Test-Path $exe)) { throw "Missing $exe - this drive was not built completely. Rebuild it with Build-RhinoVaultGo.ps1." }
  Unblock-File -Path $exe -ErrorAction SilentlyContinue   # clear "downloaded from internet" flag
}

$address = '127.0.0.1'
if ($Share) { $address = '0.0.0.0' }
$WebPort = Get-FreePort $WebPort
$LibraryPort = Get-FreePort $LibraryPort

$procs = @()
try {
  # --- Library server (only if there are ZIM files) ---
  $zims = @(Get-ChildItem -Path (Join-Path $Root 'Library\ZIM') -Filter '*.zim' -File -ErrorAction SilentlyContinue)
  if ($zims.Count -gt 0) {
    $kArgs = @("--port=$LibraryPort", '--blockexternal', '--nodatealiases', "--attachToProcess=$PID")
    if (-not $Share) { $kArgs += "--address=$address" }
    $kArgs += ($zims | ForEach-Object { '"' + $_.FullName + '"' })
    Write-Host "  Starting library ($($zims.Count) collections)..." -ForegroundColor Gray
    $procs += Start-Process -FilePath $kiwix -ArgumentList $kArgs -NoNewWindow -PassThru `
      -RedirectStandardOutput (Join-Path $LogDir 'kiwix.log') -RedirectStandardError (Join-Path $LogDir 'kiwix.err.log')
  } else {
    Write-Host '  No library collections found on this drive.' -ForegroundColor DarkYellow
  }

  # --- Offline AI (llama.cpp) - optional; RhinoVault works without it ---
  $aiProc = $null
  $llamaDir = Join-Path $Bin 'llama'
  $llama = Join-Path $llamaDir 'llama-server.exe'
  $model = Get-ChildItem -Path (Join-Path $Root 'AI\models') -Filter '*.gguf' -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($NoAI) {
    Write-Host '  AI assistant turned off (-NoAI).' -ForegroundColor DarkYellow
  } elseif ($model -and (Test-Path $llama)) {
    $ramGB = 0
    try { $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1) } catch { }
    $needGB = [math]::Ceiling($model.Length / 1GB) + 2
    if ($ramGB -gt 0 -and $ramGB -lt $needGB) {
      Write-Host "  Skipping the AI assistant: this computer has $ramGB GB of memory and the model needs about $needGB GB." -ForegroundColor DarkYellow
    } else {
      Get-ChildItem -Path $llamaDir -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
      $AiPort = Get-FreePort $AiPort
      $aArgs = @('-m', ('"' + $model.FullName + '"'), '--host', $address, '--port', "$AiPort", '-c', '4096', '-np', '1')
      Write-Host "  Starting AI assistant ($($model.BaseName))..." -ForegroundColor Gray
      $aiProc = Start-Process -FilePath $llama -ArgumentList $aArgs -WorkingDirectory $llamaDir -NoNewWindow -PassThru `
        -RedirectStandardOutput (Join-Path $LogDir 'ai.log') -RedirectStandardError (Join-Path $LogDir 'ai.err.log')
      $procs += $aiProc
    }
  }

  # --- Web server for launcher, manuals and maps (supports byte ranges for maps) ---
  # 'E:\' must not become 'E:' (cwd of E) or end in a backslash before the closing quote
  $rootArg = '"' + $Root.TrimEnd('\') + '\."'
  $wArgs = @('--host', $address, '--port', "$WebPort", '--root', $rootArg,
             '--directory-listing', 'true', '--cache-control-headers', 'false', '--log-level', 'warn')
  Write-Host '  Starting launcher...' -ForegroundColor Gray
  $procs += Start-Process -FilePath $sws -ArgumentList $wArgs -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $LogDir 'web.log') -RedirectStandardError (Join-Path $LogDir 'web.err.log')

  Start-Sleep -Seconds 2
  foreach ($p in $procs) {
    if ($p.HasExited -and $p -ne $aiProc) { throw "A RhinoVault service stopped unexpectedly. Logs: $LogDir" }
  }
  if ($aiProc -and $aiProc.HasExited) {
    Write-Host "  The AI assistant could not start (see $LogDir\ai.err.log). Everything else works." -ForegroundColor DarkYellow
  }

  $url = "http://127.0.0.1:$WebPort/RhinoVault/launcher/?kiwix=$LibraryPort&ai=$AiPort"
  Write-Host ''
  Write-Host "  RhinoVault is running:  $url" -ForegroundColor Green
  if ($Share) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) { Write-Host "  On other devices:       http://${ip}:$WebPort/RhinoVault/launcher/?kiwix=$LibraryPort&ai=$AiPort" -ForegroundColor Green }
    Write-Host '  (Windows Firewall may ask to allow access - choose Private networks.)' -ForegroundColor Gray
  }
  if (-not $NoBrowser) { Start-Process $url }

  Write-Host ''
  Read-Host '  Press Enter to stop RhinoVault (then eject the drive safely)' | Out-Null
}
finally {
  foreach ($p in $procs) {
    if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
  }
  Write-Host '  RhinoVault stopped.' -ForegroundColor Gray
}
