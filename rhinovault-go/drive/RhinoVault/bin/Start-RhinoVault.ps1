<#
.SYNOPSIS
  Starts RhinoVault Go from this drive: the offline library (kiwix-serve) and the
  launcher/manuals/maps web server (static-web-server), then opens the browser.

.PARAMETER Share
  Make RhinoVault reachable from other devices on the same network (binds 0.0.0.0).

.PARAMETER NoBrowser
  Don't open a browser window.

  Works with Windows PowerShell 5.1 and PowerShell 7.
#>
[CmdletBinding()]
param(
  [switch]$Share,
  [switch]$NoBrowser,
  [int]$WebPort = 8088,
  [int]$LibraryPort = 8090
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
    if ($p.HasExited) { throw "A RhinoVault service stopped unexpectedly. Logs: $LogDir" }
  }

  $url = "http://127.0.0.1:$WebPort/RhinoVault/launcher/?kiwix=$LibraryPort"
  Write-Host ''
  Write-Host "  RhinoVault is running:  $url" -ForegroundColor Green
  if ($Share) {
    $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
      Select-Object -ExpandProperty IPAddress
    foreach ($ip in $ips) { Write-Host "  On other devices:       http://${ip}:$WebPort/RhinoVault/launcher/?kiwix=$LibraryPort" -ForegroundColor Green }
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
