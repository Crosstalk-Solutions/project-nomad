<#
.SYNOPSIS
  Builds a RhinoVault Go offline drive: library (Kiwix ZIMs), field manuals, offline maps,
  tools, apps and the branded launcher.

.DESCRIPTION
  Content lists come from the same collections the RhinoVault server uses (../../collections),
  so the drive and the server stay in sync. Re-running the builder resumes interrupted
  downloads and skips anything already on the drive, so it doubles as the update command.

.PARAMETER Drive
  Target drive or folder, e.g. E: or E:\ or D:\RhinoVault-Staging.

.PARAMETER Edition
  lite (64 GB drive), standard (128 GB), full (512 GB recommended).

.PARAMETER MapRegions
  Override the map selection: 'all', 'none', region slugs (e.g. west-south-central)
  or state ids (e.g. texas, illinois).

.PARAMETER CacheDir
  Keep downloads in this folder and copy them to the drive. Use this when making several
  drives so each file is downloaded only once.

.PARAMETER LocalMirror
  Folder with files you already have (ZIMs, map files, archives). Any file whose name matches
  a download is copied from here instead of downloaded, e.g. a NAS share.

.PARAMETER DryRun
  Show what would be downloaded and how much space it needs, without changing anything.

.PARAMETER Prune
  Delete library and map files on the drive that are no longer part of the selected edition.

.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard -DryRun
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition lite -MapRegions east-north-central,west-south-central
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive F: -Edition full -CacheDir D:\RhinoVaultCache
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Drive,
  [ValidateSet('lite', 'standard', 'full')][string]$Edition = 'standard',
  [string[]]$MapRegions,
  [string]$CacheDir,
  [string]$LocalMirror,
  [switch]$DryRun,
  [switch]$SkipHashCheck,
  [switch]$Prune,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$GoVersion = '1.0.0'
$OnWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($IsWindows -eq $true)
$Curl = if ($OnWindows) { 'curl.exe' } else { 'curl' }
$GoDir = Split-Path -Parent $PSScriptRoot                    # rhinovault-go/
$TemplateDir = Join-Path $GoDir 'drive'
$ManifestPath = Join-Path $GoDir 'manifest.json'

# ------------------------------------------------------------------ helpers
function Say([string]$msg, [string]$color = 'Gray') { Write-Host $msg -ForegroundColor $color }
function Step([string]$msg) { Write-Host ''; Write-Host "== $msg" -ForegroundColor Yellow }
function Fmt([double]$mb) { if ($mb -ge 1024) { '{0:N1} GB' -f ($mb / 1024) } else { '{0:N0} MB' -f $mb } }
function Read-Json([string]$path) { Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json }
function Props($obj) { if ($null -eq $obj) { @() } else { $obj.PSObject.Properties } }
function Join([string]$a, [string]$b) { [System.IO.Path]::Combine($a, ($b -replace '[\\/]', [System.IO.Path]::DirectorySeparatorChar)) }
function FileNameFromUrl([string]$url) { [System.Uri]::UnescapeDataString(($url -split '[?#]')[0].TrimEnd('/').Split('/')[-1]) }

function Invoke-CurlText([string]$url) {
  $out = & $Curl -sSL --fail --max-time 60 $url
  if ($LASTEXITCODE -ne 0) { throw "Could not read $url (curl exit $LASTEXITCODE)" }
  ($out -join "`n")
}

function Get-LatestGithubTag([string]$repo) {
  # Follow GitHub's /releases/latest redirect (no API token or rate limit needed).
  $sink = [System.IO.Path]::GetTempFileName()
  try {
    $loc = & $Curl -sS -o $sink -w '%{redirect_url}' --max-time 30 "https://github.com/$repo/releases/latest" 2>$null
    if ($LASTEXITCODE -eq 0 -and "$loc" -match '/tag/([^/]+)$') { return $Matches[1] }
  } catch { }
  finally { Remove-Item -LiteralPath $sink -Force -ErrorAction SilentlyContinue }
  return $null
}

function Compare-Version([string]$a, [string]$b) {
  # Natural compare of version-ish strings ("3.7.0-2" vs "3.10.0")
  $pa = [regex]::Matches($a, '\d+') | ForEach-Object { [int64]$_.Value }
  $pb = [regex]::Matches($b, '\d+') | ForEach-Object { [int64]$_.Value }
  for ($i = 0; $i -lt [Math]::Max(@($pa).Count, @($pb).Count); $i++) {
    $x = if ($i -lt @($pa).Count) { @($pa)[$i] } else { -1 }
    $y = if ($i -lt @($pb).Count) { @($pb)[$i] } else { -1 }
    if ($x -ne $y) { return [Math]::Sign($x - $y) }
  }
  return 0
}

function Select-Best([string[]]$names, [string]$prefer) {
  $names = @($names | Sort-Object -Unique)
  if ($prefer) { $pref = @($names | Where-Object { $_ -match [regex]::Escape($prefer) }); if ($pref.Count) { $names = $pref } }
  $best = $null
  foreach ($n in $names) { if ($null -eq $best -or (Compare-Version $n $best) -gt 0) { $best = $n } }
  return $best
}

function Find-InMirror([string]$fileName, [string]$pattern) {
  if (-not $LocalMirror -or -not (Test-Path -LiteralPath $LocalMirror)) { return $null }
  if ($fileName) {
    $f = Get-ChildItem -LiteralPath $LocalMirror -Recurse -File -Filter $fileName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($f) { return $f.FullName }
  }
  if ($pattern) {
    $files = @(Get-ChildItem -LiteralPath $LocalMirror -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^$pattern$" })
    if ($files.Count) {
      $pick = Select-Best ($files | ForEach-Object { $_.Name }) $null
      return ($files | Where-Object { $_.Name -eq $pick } | Select-Object -First 1).FullName
    }
  }
  return $null
}

# Resolve a source description to { Url, FileName, Mirror }
function Resolve-Source($src, $platformSpec, [string]$fileName) {
  switch ($src.type) {
    'url' {
      $name = if ($fileName) { $fileName } else { FileNameFromUrl $src.url }
      return @{ Url = $src.url; FileName = $name; Mirror = (Find-InMirror $name $null) }
    }
    'github-release' {
      $assetTpl = if ($platformSpec) { $platformSpec.asset } else { $src.asset }
      # Prefer a mirrored copy of any version
      $pattern = [regex]::Escape($assetTpl).Replace('\{tag}', 'v?[0-9][0-9A-Za-z.\-]*')
      $m = Find-InMirror $null $pattern
      if ($m) { return @{ Url = $null; FileName = (Split-Path $m -Leaf); Mirror = $m } }
      $tag = Get-LatestGithubTag $src.repo
      if (-not $tag) { $tag = $src.pinned_tag; Say "   (using pinned version $tag of $($src.repo))" DarkGray }
      $asset = $assetTpl.Replace('{tag}', $tag)
      return @{ Url = "https://github.com/$($src.repo)/releases/download/$tag/$asset"; FileName = $asset; Mirror = $null }
    }
    'listing' {
      $pattern = if ($platformSpec) { $platformSpec.pattern } else { $src.pattern }
      $prefer = if ($platformSpec) { $platformSpec.prefer } else { $null }
      $m = Find-InMirror $null $pattern
      if ($m) { return @{ Url = $null; FileName = (Split-Path $m -Leaf); Mirror = $m } }
      $html = Invoke-CurlText $src.url
      $names = [regex]::Matches($html, "href=""($pattern)""") | ForEach-Object { $_.Groups[1].Value }
      if (-not $names) { throw "No file matching '$pattern' found at $($src.url)" }
      $pick = Select-Best $names $prefer
      return @{ Url = ($src.url.TrimEnd('/') + '/' + $pick); FileName = $pick; Mirror = $null }
    }
    default { throw "Unknown source type '$($src.type)'" }
  }
}

function Get-RemoteSha256([string]$url) {
  try {
    $txt = & $Curl -sSL --fail --max-time 30 "$url.sha256" 2>$null
    if ($LASTEXITCODE -eq 0 -and "$txt" -match '^([0-9a-fA-F]{64})') { return $Matches[1].ToLower() }
  } catch { }
  return $null
}

function Invoke-Download([string]$url, [string]$dest) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
  $part = "$dest.part"
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    & $Curl -L --fail --retry 5 --retry-delay 10 --connect-timeout 30 -C - --progress-bar -o $part $url
    $code = $LASTEXITCODE
    if ($code -eq 0) { Move-Item -LiteralPath $part -Destination $dest -Force; return }
    if ($code -eq 33 -or $code -eq 36) { Remove-Item -LiteralPath $part -Force -ErrorAction SilentlyContinue }  # server can't resume
    Say "   download interrupted (curl exit $code), retrying in 15s... ($attempt/4)" DarkYellow
    Start-Sleep -Seconds 15
  }
  throw "Download failed: $url"
}

# Get a file into $finalPath (drive or cache). Returns the local path of the file.
function Get-Item2($res, [string]$finalPath, [bool]$verify) {
  if ($res.Mirror) {
    $src = Get-Item -LiteralPath $res.Mirror
    $dst = Get-Item -LiteralPath $finalPath -ErrorAction SilentlyContinue
    if (-not $dst -or $dst.Length -ne $src.Length) {
      Say "   copying from local mirror: $($src.FullName)"
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $finalPath) | Out-Null
      Copy-Item -LiteralPath $src.FullName -Destination $finalPath -Force
    }
    return $finalPath
  }
  if ($CacheDir) {
    $cached = Join $CacheDir $res.FileName
    if (-not (Test-Path -LiteralPath $cached)) { Invoke-Download $res.Url $cached; if ($verify) { Test-Sha256 $res.Url $cached } }
    $dst = Get-Item -LiteralPath $finalPath -ErrorAction SilentlyContinue
    if (-not $dst -or $dst.Length -ne (Get-Item -LiteralPath $cached).Length) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $finalPath) | Out-Null
      Say "   copying to drive..."
      Copy-Item -LiteralPath $cached -Destination $finalPath -Force
    }
    return $finalPath
  }
  Invoke-Download $res.Url $finalPath
  if ($verify) { Test-Sha256 $res.Url $finalPath }
  return $finalPath
}

function Test-Sha256([string]$url, [string]$path) {
  if ($SkipHashCheck) { return }
  $expected = Get-RemoteSha256 $url
  if (-not $expected) { Say '   (no checksum published, skipping verification)' DarkGray; return }
  Say '   verifying checksum...'
  $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $expected) {
    Remove-Item -LiteralPath $path -Force
    throw "Checksum mismatch for $(Split-Path $path -Leaf) - the file was deleted; run the builder again to re-download."
  }
  Say '   checksum OK' DarkGreen
}

function Expand-Any([string]$archive, [string]$to) {
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  if ($archive -match '\.zip$') {
    Expand-Archive -LiteralPath $archive -DestinationPath $to -Force
  } elseif ($archive -match '\.(tar\.gz|tgz)$') {
    & tar -xzf $archive -C $to
    if ($LASTEXITCODE -ne 0) { throw "tar failed on $archive" }
  } else { throw "Don't know how to extract $archive" }
}

function Get-StrippedRoot([string]$dir, [int]$strip) {
  for ($i = 0; $i -lt $strip; $i++) {
    $kids = @(Get-ChildItem -LiteralPath $dir -Force)
    if ($kids.Count -eq 1 -and $kids[0].PSIsContainer) { $dir = $kids[0].FullName } else { break }
  }
  return $dir
}

function New-TempDir { $p = Join ([System.IO.Path]::GetTempPath()) ('rvgo-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory -Path $p | Out-Null; $p }

# ------------------------------------------------------------------ plan
$manifest = Read-Json $ManifestPath
$colWiki = Read-Json (Join $GoDir $manifest.collections.wikipedia)
$colZim = Read-Json (Join $GoDir $manifest.collections.zim_categories)
$colMaps = Read-Json (Join $GoDir $manifest.collections.maps)
$prof = $manifest.profiles.$Edition

$plan = New-Object System.Collections.Generic.List[object]
function Add-Plan($item) { if (-not ($plan | Where-Object { $_.Kind -eq $item.Kind -and $_.Id -eq $item.Id })) { $plan.Add([pscustomobject]$item) } }

# Wikipedia
if ($prof.wikipedia -and $prof.wikipedia -ne 'none') {
  $w = $colWiki.options | Where-Object { $_.id -eq $prof.wikipedia }
  if ($w -and $w.url) {
    Add-Plan @{ Kind = 'zim'; Id = "wikipedia-$($w.id)"; Title = "Wikipedia: $($w.name)"; Category = 'Encyclopedia'
      Description = $w.description; SizeMB = [double]$w.size_mb; Url = $w.url; Verify = $true }
  }
}

# Library categories (tiers include lower tiers)
foreach ($p in (Props $prof.tiers)) {
  $cat = $colZim.categories | Where-Object { $_.slug -eq $p.Name }
  if (-not $cat -or -not $p.Value) { continue }
  $tierSlug = $p.Value
  $chain = @()
  while ($tierSlug) {
    $tier = $cat.tiers | Where-Object { $_.slug -eq $tierSlug }
    if (-not $tier) { break }
    $chain += $tier; $tierSlug = $tier.includesTier
  }
  foreach ($tier in $chain) {
    foreach ($r in $tier.resources) {
      Add-Plan @{ Kind = 'zim'; Id = $r.id; Title = $r.title; Category = $cat.name; Description = $r.description
        SizeMB = [double]$r.size_mb; Url = $r.url; Verify = $true }
    }
  }
}

# Maps
# Accept 'a,b' as well as @('a','b') (pwsh -File and .cmd callers pass one string)
$MapRegions = @($MapRegions | ForEach-Object { $_ -split '[,;\s]+' } | Where-Object { $_ } | ForEach-Object { $_.ToLower() })
$regionSel = if ($MapRegions.Count) { $MapRegions } else { @($prof.map_regions) }
if (-not ($regionSel -contains 'none')) {
  foreach ($c in $colMaps.collections) {
    foreach ($r in $c.resources) {
      if ($regionSel -contains 'all' -or $regionSel -contains $c.slug -or $regionSel -contains $r.id) {
        Add-Plan @{ Kind = 'map'; Id = $r.id; Title = $r.title; Category = $c.name; Description = $r.description
          SizeMB = [double]$r.size_mb; Url = $r.url; Verify = $false }
      }
    }
  }
}

# Extras
$extraIds = @($prof.extras) + @(Props $manifest.extras | Where-Object { $_.Value.always } | ForEach-Object { $_.Name })
foreach ($id in ($extraIds | Select-Object -Unique)) {
  $e = $manifest.extras.$id
  if (-not $e) { Say "Unknown extra '$id' in manifest - skipped" DarkYellow; continue }
  Add-Plan @{ Kind = 'extra'; Id = $id; Title = $e.title; Category = $e.category; SizeMB = [double]$e.approx_mb; Spec = $e; Verify = $false }
}

# Runtime binaries for every platform, so the drive works on Windows, Mac and Linux
foreach ($rt in $manifest.runtime) {
  foreach ($pl in (Props $rt.platforms)) {
    Add-Plan @{ Kind = 'runtime'; Id = "$($rt.id)-$($pl.Name)"; Title = "$($rt.title) [$($pl.Name)]"; Platform = $pl.Name
      SizeMB = 15; Spec = $rt; PlatformSpec = $pl.Value; Verify = $false }
  }
}

# ------------------------------------------------------------------ target + space
if (-not (Test-Path -LiteralPath $Drive)) {
  if ($Drive -match '^[A-Za-z]:\\?$') { throw "Drive $Drive was not found. Plug in the USB drive and check its letter in File Explorer." }
  New-Item -ItemType Directory -Force -Path $Drive | Out-Null
}
$Target = (Resolve-Path -LiteralPath $Drive).Path
if ($Target -match '^[A-Za-z]:$') { $Target += '\' }
$StateDir = Join $Target 'RhinoVault/.state'

function Get-ZimPath($it) { Join $Target ('Library/ZIM/' + (FileNameFromUrl $it.Url)) }
function Get-MapPath($it) { Join $Target ('Maps/pmtiles/' + (FileNameFromUrl $it.Url)) }
function Get-Marker($it) { Join $StateDir ("$($it.Kind)-$($it.Id).done") }
function Test-Done($it, [string]$key) {
  $m = Get-Marker $it
  (Test-Path -LiteralPath $m) -and ((Get-Content -LiteralPath $m -Raw).Trim() -eq $key)
}
function Set-Done($it, [string]$key) { New-Item -ItemType Directory -Force -Path $StateDir | Out-Null; Set-Content -LiteralPath (Get-Marker $it) -Value $key -Encoding UTF8 }

# Work out what still needs downloading
$todo = @(); $needMB = 0
foreach ($it in $plan) {
  $done = switch ($it.Kind) {
    'zim' { Test-Path -LiteralPath (Get-ZimPath $it) }
    'map' { Test-Path -LiteralPath (Get-MapPath $it) }
    default { (Test-Path -LiteralPath (Get-Marker $it)) }
  }
  if (-not $done) { $todo += $it; $needMB += $it.SizeMB }
}

$totalMB = ($plan | Measure-Object SizeMB -Sum).Sum
$psd = Get-PSDrive -Name ((Get-Item -LiteralPath $Target).PSDrive.Name)
$freeMB = [math]::Floor($psd.Free / 1MB)

Write-Host ''
Write-Host '  RhinoVault Go builder' -ForegroundColor Yellow -NoNewline; Write-Host "  v$GoVersion" -ForegroundColor DarkGray
Say "  Edition : $($prof.label)"
Say "  Target  : $Target   (free: $(Fmt $freeMB))"
Say "  Content : $($plan.Count) items, $(Fmt $totalMB) total, $(Fmt $needMB) still to download"
Write-Host ''
$plan | Group-Object Kind | ForEach-Object {
  $label = @{ zim = 'Library collections'; map = 'Map regions'; extra = 'Extras'; runtime = 'Runtime tools' }[$_.Name]
  Say ('  {0,-22} {1,4} items  {2,10}' -f $label, $_.Count, (Fmt (($_.Group | Measure-Object SizeMB -Sum).Sum)))
}

if ($DryRun) {
  Step 'Dry run - items that would be downloaded'
  foreach ($it in $todo) { Say ('  [{0,-7}] {1,-60} {2,10}' -f $it.Kind, $it.Title, (Fmt $it.SizeMB)) }
  if ($needMB * 1.05 -gt $freeMB) { Say "`n  WARNING: needs about $(Fmt ($needMB * 1.05)) but only $(Fmt $freeMB) is free." Red }
  return
}

if (-not $Force -and ($needMB * 1.05) -gt $freeMB) {
  throw "Not enough space: about $(Fmt ($needMB * 1.05)) needed, $(Fmt $freeMB) free. Use a bigger drive, a smaller -Edition, fewer -MapRegions, or -Force."
}
if ($Target -match '^[A-Za-z]:\\$') {
  $vol = Get-Volume -DriveLetter $Target[0] -ErrorAction SilentlyContinue
  if ($vol -and $vol.FileSystem -eq 'FAT32') {
    throw "Drive $Target is FAT32, which cannot hold files over 4 GB (Wikipedia and big maps). Format it as exFAT (or use Ventoy with exFAT) and run again."
  }
}

# ------------------------------------------------------------------ build
$failed = @()
$i = 0
foreach ($it in $plan) {
  $i++
  Step ("[{0}/{1}] {2}" -f $i, $plan.Count, $it.Title)
  try {
    switch ($it.Kind) {
      'zim' {
        $dest = Get-ZimPath $it
        if (Test-Path -LiteralPath $dest) { Say '   already on drive' DarkGreen; break }
        $res = @{ Url = $it.Url; FileName = (FileNameFromUrl $it.Url); Mirror = (Find-InMirror (FileNameFromUrl $it.Url) $null) }
        $null = Get-Item2 $res $dest $true
      }
      'map' {
        $dest = Get-MapPath $it
        if (Test-Path -LiteralPath $dest) { Say '   already on drive' DarkGreen; break }
        $res = @{ Url = $it.Url; FileName = (FileNameFromUrl $it.Url); Mirror = (Find-InMirror (FileNameFromUrl $it.Url) $null) }
        $null = Get-Item2 $res $dest $false
      }
      'extra' {
        $e = $it.Spec
        $res = Resolve-Source $e.source $null $e.file
        $key = if ($res.Url) { $res.Url } else { $res.FileName }
        if (Test-Done $it $key) { Say '   already on drive' DarkGreen; break }
        if ($e.extract) {
          # Archives go to cache (or a temp folder), then get unpacked onto the drive
          $tmp = New-TempDir
          try {
            $archive = if ($CacheDir) { Join $CacheDir $res.FileName } else { Join $tmp $res.FileName }
            if ($res.Mirror) { $archive = $res.Mirror }
            elseif (-not (Test-Path -LiteralPath $archive)) { Invoke-Download $res.Url $archive }
            Say '   unpacking...'
            $x = Join $tmp 'x'; Expand-Any $archive $x
            $srcRoot = Get-StrippedRoot $x ([int]$e.extract.strip)
            $destDir = Join $Target $e.extract.to
            New-Item -ItemType Directory -Force -Path $destDir | Out-Null
            if ($e.extract.only) {
              $files = @(Get-ChildItem -LiteralPath $srcRoot -Recurse -File -Filter $e.extract.only)
              foreach ($f in $files) {
                $rel = $f.FullName.Substring($srcRoot.Length).TrimStart('\', '/')
                if ($e.extract.flatten) { $rel = $f.Name }
                $out = Join $destDir $rel
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $out) | Out-Null
                Move-Item -LiteralPath $f.FullName -Destination $out -Force
              }
              Say "   $($files.Count) files placed in $($e.extract.to)"
            } else {
              Get-ChildItem -LiteralPath $srcRoot -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destDir -Recurse -Force }
              Say "   placed in $($e.extract.to)"
            }
          } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
        } else {
          $destDir = if ($e.dest) { $e.dest } else { 'Extras' }
          $null = Get-Item2 $res (Join $Target ($destDir + '/' + $res.FileName)) $false
        }
        Set-Done $it $key
      }
      'runtime' {
        $res = Resolve-Source $it.Spec.source $it.PlatformSpec $null
        $key = if ($res.Url) { $res.Url } else { $res.FileName }
        if (Test-Done $it $key) { Say '   already on drive' DarkGreen; break }
        $tmp = New-TempDir
        try {
          $archive = if ($res.Mirror) { $res.Mirror } elseif ($CacheDir) { Join $CacheDir $res.FileName } else { Join $tmp $res.FileName }
          if (-not $res.Mirror -and -not (Test-Path -LiteralPath $archive)) { Invoke-Download $res.Url $archive }
          $x = Join $tmp 'x'; Expand-Any $archive $x
          $binDir = Join $Target ("RhinoVault/bin/" + $it.Platform)
          New-Item -ItemType Directory -Force -Path $binDir | Out-Null
          $kept = 0
          foreach ($pat in $it.Spec.keep) {
            Get-ChildItem -LiteralPath $x -Recurse -File -Filter $pat | ForEach-Object {
              Copy-Item -LiteralPath $_.FullName -Destination (Join $binDir $_.Name) -Force; $kept++
            }
          }
          if ($kept -eq 0) { throw "No usable files found in $($res.FileName)" }
          Say "   $kept file(s) -> RhinoVault/bin/$($it.Platform)"
        } finally { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
        Set-Done $it $key
      }
    }
  } catch {
    Say "   FAILED: $($_.Exception.Message)" Red
    $failed += $it
  }
}

# ------------------------------------------------------------------ prune
if ($Prune) {
  Step 'Removing content that is not part of this edition'
  $keepZim = @($plan | Where-Object Kind -eq 'zim' | ForEach-Object { FileNameFromUrl $_.Url })
  $keepMap = @($plan | Where-Object Kind -eq 'map' | ForEach-Object { FileNameFromUrl $_.Url })
  Get-ChildItem -LiteralPath (Join $Target 'Library/ZIM') -Filter *.zim -File -ErrorAction SilentlyContinue |
    Where-Object { $keepZim -notcontains $_.Name } | ForEach-Object { Say "   removing $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Force }
  Get-ChildItem -LiteralPath (Join $Target 'Maps/pmtiles') -Filter *.pmtiles -File -ErrorAction SilentlyContinue |
    Where-Object { $keepMap -notcontains $_.Name } | ForEach-Object { Say "   removing $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Force }
}

# ------------------------------------------------------------------ launcher + index
Step 'Installing launcher and start shortcuts'
Get-ChildItem -LiteralPath $TemplateDir -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $Target -Recurse -Force }

Step 'Writing drive index'
# Branch from the publication designator anywhere in the title, e.g. "FM 21-76", "Ranger Handbook TC 3-21.76"
$branchRules = @(
  @{ re = '(^|[\s(])(FM|ATP|TC|ADP|ADRP|AR|STP|GTA|ATTP|TM|DA[ _-]?PAM)[\s_-]*\d'; b = 'Army' },
  @{ re = '(^|[\s(])(MCWP|MCRP|MCTP|MCDP|MCO|NAVMC|FMFM)[\s_-]*\d'; b = 'Marine Corps' },
  @{ re = '(^|[\s(])(NWP|NTTP|NAVEDTRA|NAVSEA|OPNAV)[\s_-]*\d'; b = 'Navy' },
  @{ re = '(^|[\s(])(AFMAN|AFI|AFTTP|AFH|AFDP|AFPAM)[\s_-]*\d'; b = 'Air Force' },
  @{ re = '(^|[\s(])(JP|CJCSM?|CJCSI)[\s_-]*\d'; b = 'Joint' },
  @{ re = '(^|[\s(])(CGTTP|COMDTINST)[\s_-]*\d'; b = 'Coast Guard' },
  @{ re = '(?i)\b(army|ranger)\b'; b = 'Army' },
  @{ re = '(?i)\b(marine|usmc)\b'; b = 'Marine Corps' }
)
$manualRoot = Join $Target 'Library/Field-Manuals'
$manuals = @()
if (Test-Path -LiteralPath $manualRoot) {
  $manuals = @(Get-ChildItem -LiteralPath $manualRoot -Recurse -File -Filter *.pdf | Sort-Object Name | ForEach-Object {
    $title = [System.IO.Path]::GetFileNameWithoutExtension($_.Name) -replace '[_]+', ' '
    $branch = 'Other'
    foreach ($r in $branchRules) { if ($title -match $r.re) { $branch = $r.b; break } }
    if ($branch -eq 'Other' -and $_.Directory.FullName -ne $manualRoot) { $branch = $_.Directory.Name }
    [ordered]@{ title = $title; branch = $branch; size_mb = [math]::Round($_.Length / 1MB, 1)
      file = ($_.FullName.Substring($Target.TrimEnd('\', '/').Length).TrimStart('\', '/') -replace '\\', '/') }
  })
}

$zims = @($plan | Where-Object Kind -eq 'zim' | Where-Object { Test-Path -LiteralPath (Get-ZimPath $_) } | ForEach-Object {
  $fn = FileNameFromUrl $_.Url
  [ordered]@{ name = [System.IO.Path]::GetFileNameWithoutExtension($fn); file = "Library/ZIM/$fn"; title = $_.Title
    category = $_.Category; description = $_.Description; size_mb = $_.SizeMB }
})
$maps = @($plan | Where-Object Kind -eq 'map' | Where-Object { Test-Path -LiteralPath (Get-MapPath $_) } | ForEach-Object {
  [ordered]@{ id = $_.Id; title = $_.Title; region = $_.Category; file = (FileNameFromUrl $_.Url); size_mb = $_.SizeMB }
})
$tools = @()
$cc = Get-ChildItem -LiteralPath (Join $Target 'Tools/CyberChef') -Filter 'CyberChef*.html' -File -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cc) { $tools += [ordered]@{ title = 'CyberChef - encode, decode, encrypt, hash'; file = "Tools/CyberChef/$($cc.Name)" } }
$apps = @()
if (Test-Path -LiteralPath (Join $Target 'Apps/Windows/KeePassXC')) {
  $apps += [ordered]@{ title = 'KeePassXC password manager'; platform = 'Windows'; folder = 'Apps/Windows/KeePassXC'; run = 'KeePassXC.exe' }
}
$isos = @(Get-ChildItem -LiteralPath (Join $Target 'ISOs') -Filter *.iso -File -ErrorAction SilentlyContinue | ForEach-Object {
  [ordered]@{ title = ($_.BaseName -replace '[-_]', ' '); file = "ISOs/$($_.Name)"; size_mb = [math]::Round($_.Length / 1MB) }
})
$credits = @(
  'RhinoVault Go by RhinoPCTec. Based on Project N.O.M.A.D. by Crosstalk Solutions, LLC (Apache-2.0).',
  'Library collections are ZIM files from Kiwix (kiwix.org); each collection belongs to its original publisher and license, e.g. Wikipedia (CC BY-SA).',
  'Kiwix tools (GPL-3.0), Static Web Server (Apache-2.0/MIT), MapLibre GL JS and PMTiles (BSD-3-Clause).',
  'Map data (c) OpenStreetMap contributors (ODbL); basemap style and fonts from Protomaps.'
)
foreach ($e in ($plan | Where-Object Kind -eq 'extra')) { if ($e.Spec.credit) { $credits += "$($e.Title): $($e.Spec.credit)" } }

$index = [ordered]@{
  version = $GoVersion; edition = $Edition; profile_label = $prof.label
  built = (Get-Date).ToUniversalTime().ToString('o')
  zims = $zims; manuals = $manuals; maps = $maps; tools = $tools; apps = $apps; isos = $isos; credits = $credits
}
$indexPath = Join $Target 'RhinoVault/launcher/library.json'
[System.IO.File]::WriteAllText($indexPath, ($index | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

$readme = @"
RhinoVault Go - offline survival library by RhinoPCTec
=======================================================

To start, double-click the shortcut for your computer:
  Windows : Start RhinoVault (Windows).cmd
  Mac     : Start RhinoVault (Mac).command   (first time: right-click > Open)
  Linux   : Start RhinoVault (Linux).sh

Your browser opens the RhinoVault launcher. When you're done, press Enter in the
RhinoVault window, then eject the drive safely.

Edition: $($prof.label)
Built:   $(Get-Date -Format 'yyyy-MM-dd')
Content: $($zims.Count) library collections, $($manuals.Count) field manuals, $($maps.Count) map regions
"@
[System.IO.File]::WriteAllText((Join $Target 'README - Start Here.txt'), ($readme -replace "`r?`n", "`r`n"), (New-Object System.Text.UTF8Encoding($false)))

Step 'Done'
Say ("  {0} library collections, {1} field manuals, {2} map regions, {3} tools, {4} apps, {5} ISOs" -f `
  $zims.Count, $manuals.Count, $maps.Count, $tools.Count, $apps.Count, $isos.Count) Green
if ($failed.Count) {
  Say "  $($failed.Count) item(s) failed - run the same command again to retry:" Red
  $failed | ForEach-Object { Say "   - $($_.Title)" Red }
  exit 1
}
Say '  The drive is ready. Eject it safely before unplugging.' Green
