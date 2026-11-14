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

.PARAMETER DownloadOnly
  Download everything into -CacheDir and stop - no drive is built. Use with -Edition all to keep
  one complete offline copy (for example on G:), then build drives from it with -LocalMirror.
  Files already in the folder are kept, so running it again only fetches what is missing.

.PARAMETER DryRun
  Show what would be downloaded and how much space it needs, without changing anything.

.PARAMETER Prune
  Delete library and map files on the drive that are no longer part of the selected edition.

.PARAMETER BooksFolder
  One or more folders holding the ebooks listed in books/ebooks.csv, e.g.
  "S:\Files\Survial\SolomonDigital\EBooks","C:\Users\Ralph Castillo\Desktop\Survival Project".
  Each listed file is looked up in these folders by its path in the list.

.PARAMETER Use
  Who the drive is for, which decides what may go on it:
  sale (default) - public domain only, safe for drives you sell;
  free - also books that may be shared free but not sold (e.g. Hesperian's Where There Is No Doctor);
  personal - also personal-use-only material: your own copyrighted books and magazines, TruePrepper
  checklists. For your own drives only - never sell or give away a personal drive.

.PARAMETER Books
  Book tier to copy: none, essential (~7 GB), core (~38 GB) or all (~96 GB). Defaults to the edition's tier.

.PARAMETER IndexBooks
  Which books the Ask RhinoVault search index covers: none, essential, core or all. Default: essential.
  Indexing everything takes a long time and adds several GB, so larger tiers are opt-in.

.PARAMETER NoAI
  Leave out the offline AI assistant (engine and model). The field manual search index is still built.

.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard -DryRun
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition lite -MapRegions east-north-central,west-south-central
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive F: -Edition full -CacheDir D:\RhinoVaultCache
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -DownloadOnly -Edition all -CacheDir "G:\RhinoVault Project\Downloads"
.EXAMPLE
  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard -LocalMirror "G:\RhinoVault Project\Downloads"
#>
[CmdletBinding()]
param(
  [string]$Drive,
  [ValidateSet('lite', 'standard', 'full', 'all')][string]$Edition = 'standard',
  [string[]]$MapRegions,
  [string]$CacheDir,
  [string]$LocalMirror,
  [switch]$DryRun,
  [switch]$SkipHashCheck,
  [switch]$Prune,
  [switch]$NoAI,
  [string[]]$BooksFolder,
  [ValidateSet('sale', 'free', 'personal')][string]$Use = 'sale',
  [ValidateSet('', 'none', 'essential', 'core', 'all')][string]$Books = '',
  [ValidateSet('', 'none', 'essential', 'core', 'all')][string]$IndexBooks = '',
  [switch]$Force,
  [switch]$DownloadOnly
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

function Get-NewestGithubTag([string]$repo, [string]$tagPattern) {
  # Newest tag on the releases page that has the expected shape (e.g. ^b[0-9]+$)
  try {
    $html = Invoke-CurlText "https://github.com/$repo/releases"
    $tags = @([regex]::Matches($html, 'releases/tag/([^"/?#]+)') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -match $tagPattern })
    if ($tags.Count) { return (Select-Best $tags $null) }
  } catch { }
  return $null
}

function Get-GithubAssets([string]$repo, [string]$tag) {
  # File names attached to a release (GitHub's expanded_assets page; no API token needed)
  try {
    $html = Invoke-CurlText "https://github.com/$repo/releases/expanded_assets/$tag"
    return @([regex]::Matches($html, 'releases/download/[^/"]+/([^"/?#]+)"') | ForEach-Object { [System.Uri]::UnescapeDataString($_.Groups[1].Value) } | Sort-Object -Unique)
  } catch { return @() }
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
      $assetPat = if ($platformSpec -and $platformSpec.asset_pattern) { $platformSpec.asset_pattern } else { $src.asset_pattern }
      # Prefer a mirrored copy of any version
      $pattern = [regex]::Escape($assetTpl).Replace('\{tag}', 'v?[0-9A-Za-z][0-9A-Za-z.\-]*').Replace('\{version}', '[0-9][0-9A-Za-z.\-]*')
      $m = Find-InMirror $null $pattern
      if (-not $m -and $assetPat) { $m = Find-InMirror $null $assetPat }
      if ($m) { return @{ Url = $null; FileName = (Split-Path $m -Leaf); Mirror = $m } }
      $urls = @()
      $tag = Get-LatestGithubTag $src.repo
      # Some projects publish odd "latest" releases (e.g. llama.cpp v0.9.0 with no binaries): require the usual tag shape
      if ($tag -and $src.tag_pattern -and $tag -notmatch $src.tag_pattern) { $tag = Get-NewestGithubTag $src.repo $src.tag_pattern }
      if ($tag) {
        $want = $assetTpl.Replace('{tag}', $tag).Replace('{version}', ($tag -replace '^v', ''))
        $assets = @(Get-GithubAssets $src.repo $tag)
        $pick = $null
        if (-not $assets.Count) { $pick = $want }                       # could not list assets: try the usual name
        elseif ($assets -contains $want) { $pick = $want }
        elseif ($assetPat) { $hits = @($assets | Where-Object { $_ -match "^$assetPat$" }); if ($hits.Count) { $pick = Select-Best $hits $null } }
        if ($pick) { $urls += "https://github.com/$($src.repo)/releases/download/$tag/$pick" }
        else { Say "   (newest release $tag of $($src.repo) has no matching download)" DarkGray }
      }
      if ($src.pinned_tag) {
        $pinAsset = $assetTpl.Replace('{tag}', $src.pinned_tag).Replace('{version}', ($src.pinned_tag -replace '^v', ''))
        $pinUrl = "https://github.com/$($src.repo)/releases/download/$($src.pinned_tag)/$pinAsset"
        if ($urls -notcontains $pinUrl) { $urls += $pinUrl }
      }
      if (-not $urls.Count) { throw "No download found for $($src.repo)" }
      return @{ Url = $urls[0]; Urls = $urls; FileName = (FileNameFromUrl $urls[0]); Mirror = $null }
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

function Invoke-DownloadAny([string[]]$urls, [string]$dest) {
  $last = $null
  foreach ($u in $urls) {
    try { Invoke-Download $u $dest; return $u } catch { $last = $_; Say "   source failed, trying next: $u" DarkYellow }
  }
  throw $last
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

function Get-Remote($res, [string]$dest) {
  if ($res.Urls) { return (Invoke-DownloadAny @($res.Urls) $dest) }
  Invoke-Download $res.Url $dest
  return $res.Url
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
    if (-not (Test-Path -LiteralPath $cached)) { $used = Get-Remote $res $cached; if ($verify) { Test-Sha256 $used $cached } }
    $dst = Get-Item -LiteralPath $finalPath -ErrorAction SilentlyContinue
    if (-not $dst -or $dst.Length -ne (Get-Item -LiteralPath $cached).Length) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $finalPath) | Out-Null
      Say "   copying to drive..."
      Copy-Item -LiteralPath $cached -Destination $finalPath -Force
    }
    return $finalPath
  }
  $used = Get-Remote $res $finalPath
  if ($verify) { Test-Sha256 $used $finalPath }
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

# Windows PowerShell 5.1 turns any stderr line from a native command into a terminating error while
# $ErrorActionPreference is 'Stop', even when it is redirected. tar warns on every symlink it can't create,
# so run it with errors allowed and judge it by its exit code.
function Invoke-Tar([string[]]$tarArgs) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & tar @tarArgs 2>&1
    $code = $LASTEXITCODE
  } finally { $ErrorActionPreference = $old }
  return [pscustomobject]@{ Code = $code; Lines = @($out | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } | ForEach-Object { "$_" }) }
}

function Expand-Any([string]$archive, [string]$to) {
  New-Item -ItemType Directory -Force -Path $to | Out-Null
  if ($archive -match '\.zip$') {
    Expand-Archive -LiteralPath $archive -DestinationPath $to -Force
  } elseif ($archive -match '\.(tar\.gz|tgz)$') {
    $tarCode = (Invoke-Tar @('-xzf', $archive, '-C', $to)).Code
    $links = Resolve-TarLinks $archive $to
    if ($tarCode -ne 0 -and $links -eq 0) { throw "tar failed on $archive" }
  } else { throw "Don't know how to extract $archive" }
}

# Mac/Linux archives use symlinks for shared libraries (libllama.0.dylib -> libllama.0.4.1.dylib).
# exFAT drives can't store links and Windows can't always create them, so replace every link with a
# real copy of its target. Returns the number of links handled.
function Resolve-TarLinks([string]$archive, [string]$to) {
  $listing = (Invoke-Tar @('-tvzf', $archive)).Lines
  $n = 0
  for ($pass = 0; $pass -lt 3; $pass++) {           # links to links resolve over a few passes
    foreach ($line in $listing) {
      if ($line -notmatch '^l' -or $line -notmatch '\s(\S+) -> (\S+)\s*$') { continue }
      $linkRel = $Matches[1]; $targetRel = $Matches[2]
      $linkPath = Join $to $linkRel
      $targetPath = if ([System.IO.Path]::IsPathRooted($targetRel)) { $null } else { Join (Split-Path -Parent $linkPath) $targetRel }
      if (-not $targetPath -or -not (Test-Path -LiteralPath $targetPath -PathType Leaf)) { continue }
      $item = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
      if ($item -and -not $item.LinkType -and $item.Length -gt 0) { continue }   # already a real file
      if ($item) { Remove-Item -LiteralPath $linkPath -Force }
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $linkPath) | Out-Null
      Copy-Item -LiteralPath $targetPath -Destination $linkPath -Force
      $n++
    }
  }
  return $n
}

function Get-StrippedRoot([string]$dir, [int]$strip) {
  for ($i = 0; $i -lt $strip; $i++) {
    $kids = @(Get-ChildItem -LiteralPath $dir -Force)
    if ($kids.Count -eq 1 -and $kids[0].PSIsContainer) { $dir = $kids[0].FullName } else { break }
  }
  return $dir
}

function New-TempDir { $p = Join ([System.IO.Path]::GetTempPath()) ('rvgo-' + [guid]::NewGuid().ToString('N').Substring(0, 8)); New-Item -ItemType Directory -Path $p | Out-Null; $p }

# Kiwix replaces dated files (name_2026-01.zim) and deletes old ones, so a fixed URL stops working.
# Keep the copy already on the drive; otherwise use the newest file in the mirror or the Kiwix folder.
$ZimListings = @{}
function Resolve-LatestZim([string]$url) {
  $name = FileNameFromUrl $url
  if ($name -notmatch '^(.+)_(\d{4}-\d{2})\.zim$') { return $url }
  $base = $Matches[1]
  $dir = $url.Substring(0, $url.LastIndexOf('/') + 1)
  $pat = [regex]::Escape($base) + '_\d{4}-\d{2}\.zim'
  $onDrive = @(Get-ChildItem -LiteralPath (Join $Target 'Library/ZIM') -Filter '*.zim' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^$pat$" } | ForEach-Object { $_.Name })
  if ($onDrive.Count) { return $dir + (Select-Best $onDrive $null) }
  $m = Find-InMirror $null $pat
  if ($m) { return $dir + (Split-Path $m -Leaf) }
  if (-not $ZimListings.ContainsKey($dir)) { try { $ZimListings[$dir] = Invoke-CurlText $dir } catch { $ZimListings[$dir] = '' } }
  $names = @([regex]::Matches($ZimListings[$dir], "href=""($pat)""") | ForEach-Object { $_.Groups[1].Value })
  if (-not $names.Count) { return $url }
  return $dir + (Select-Best $names $null)
}
# ------------------------------------------------------------------ field manual search index
# A small BM25 index the launcher's "Ask RhinoVault" page searches in the browser. Text comes from
# pdftotext; pages are split into ~1200-character chunks. Terms are sharded by a hash so the browser
# only loads the shards for the words in a question. The tokenizer and hash MUST match ask.js.
$IndexVersion = 2   # bump whenever tokenizing changes (must match ask.js)
$ChunkShardSize = 400
$TermShards = 64
$StopWords = New-Object 'System.Collections.Generic.HashSet[string]'
@('the','and','for','are','but','not','you','all','any','can','had','her','was','one','our','out','has','his','how','its','may',
  'new','now','see','two','who','did','get','him','let','say','she','too','use','with','that','this','from','they','will','have',
  'been','were','what','when','which','their','there','into','than','then','them','these','those','such','shall','also','each',
  'other','some','only','very','more','most','must','upon','over','under','about','after','before','while','where','being',
  'would','could','should','does','done','your','yours','page','figure','table','chapter','section','paragraph','appendix','www','http','https',
  'without','within','is','it','in','of','on','or','to','as','at','be','by','an','if','no','so','up','we','do','go','he','me','my','am','us') |
  ForEach-Object { [void]$StopWords.Add($_) }

function Get-Stem([string]$w) {
  if ($w.Length -gt 5 -and $w.EndsWith('ing')) { return $w.Substring(0, $w.Length - 3) }
  if ($w.Length -gt 4 -and $w.EndsWith('ed')) { return $w.Substring(0, $w.Length - 2) }
  if ($w.Length -gt 4 -and $w.EndsWith('es')) { return $w.Substring(0, $w.Length - 2) }
  if ($w.Length -gt 3 -and $w.EndsWith('s') -and -not $w.EndsWith('ss')) { return $w.Substring(0, $w.Length - 1) }
  return $w
}
function Get-Tokens([string]$text) {
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($w in [regex]::Split($text.ToLowerInvariant(), '[^a-z0-9]+')) {
    if ($w.Length -lt 2 -or $w.Length -gt 30 -or $StopWords.Contains($w)) { continue }
    if ($w -match '^\d+$' -and $w.Length -gt 4) { continue }
    $out.Add((Get-Stem $w))
  }
  return , $out
}
function Get-TermShard([string]$t) {
  [int64]$h = 0
  foreach ($c in $t.ToCharArray()) { $h = ($h * 31 + [int]$c) % $TermShards }
  return [int]$h
}
function ConvertTo-JStr([string]$s) {
  '"' + ((($s -replace '\\', '\\') -replace '"', '\"') -replace '[\x00-\x1F]', ' ') + '"'
}
function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-PdfToText {
  $cmd = Get-Command pdftotext -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (-not $OnWindows) { return $null }
  $tool = $manifest.build_tools.'poppler-windows'
  $toolsDir = if ($CacheDir) { Join $CacheDir 'tools' } else { Join $env:LOCALAPPDATA 'RhinoVaultGo/tools' }
  $existing = Get-ChildItem -LiteralPath $toolsDir -Recurse -Filter $tool.exe -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) { return $existing.FullName }
  Say '   getting pdftotext (Poppler) for text extraction...'
  $res = Resolve-Source $tool.source $null $null
  $zip = Join $toolsDir $res.FileName
  if ($res.Mirror) { $zip = $res.Mirror } else { $null = Get-Remote $res $zip }
  Expand-Any $zip (Join $toolsDir 'poppler')
  $found = Get-ChildItem -LiteralPath (Join $toolsDir 'poppler') -Recurse -Filter $tool.exe -File | Select-Object -First 1
  if ($found) { return $found.FullName }
  return $null
}

function Build-ManualIndex($manualList, [string]$outDir) {
  if (-not $manualList.Count) { return $null }
  $stampSrc = "v$IndexVersion|" + (($manualList | ForEach-Object { "$($_.file):$($_.size_mb):$($_.title)" }) -join '|')
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stamp = -join ($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($stampSrc)) | ForEach-Object { $_.ToString('x2') })
  $metaPath = Join $outDir 'meta.json'
  if (Test-Path -LiteralPath $metaPath) {
    $old = Read-Json $metaPath
    if ($old.stamp -eq $stamp) { Say '   search index is up to date' DarkGreen; return $old }
  }
  $pdftotext = Get-PdfToText
  if (-not $pdftotext) { Say '   pdftotext not found - skipping the manual search index (install poppler-utils)' DarkYellow; return $null }

  if (Test-Path -LiteralPath $outDir) { Remove-Item -LiteralPath $outDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $postings = New-Object 'System.Collections.Generic.Dictionary[string,System.Collections.Generic.List[int]]'
  $chunkLens = New-Object System.Collections.Generic.List[int]
  $shard = New-Object System.Text.StringBuilder
  $docs = New-Object System.Collections.Generic.List[string]
  $chunkId = 0; $shardNo = 0; $inShard = 0; $noText = 0
  $tmpTxt = [System.IO.Path]::GetTempFileName()

  $flush = {
    if ($inShard -gt 0) {
      Write-Utf8 (Join $outDir ("chunks-$shardNo.json")) ('[' + $shard.ToString().TrimEnd(',') + ']')
      [void]$shard.Clear(); $shardNo++; $inShard = 0
    }
  }

  for ($d = 0; $d -lt $manualList.Count; $d++) {
    $m = $manualList[$d]
    $docs.Add('{"f":' + (ConvertTo-JStr $m.file) + ',"t":' + (ConvertTo-JStr $m.title) + ',"b":' + (ConvertTo-JStr $m.branch) + '}')
    Write-Progress -Activity 'Indexing field manuals' -Status $m.title -PercentComplete (100 * $d / $manualList.Count)
    & $pdftotext -q -enc UTF-8 (Join $Target $m.file) $tmpTxt 2>$null
    if ($LASTEXITCODE -ne 0) { $noText++; continue }
    $raw = [System.IO.File]::ReadAllText($tmpTxt, [System.Text.Encoding]::UTF8)
    $pages = $raw -split "`f"
    $hadText = $false
    for ($p = 0; $p -lt $pages.Count; $p++) {
      $text = ($pages[$p] -replace '\s+', ' ').Trim()
      if ($text.Length -lt 80) { continue }
      $hadText = $true
      # split long pages into ~1200 char chunks on sentence-ish boundaries
      $pieces = New-Object System.Collections.Generic.List[string]
      while ($text.Length -gt 1500) {
        $cut = $text.LastIndexOf('. ', 1200); if ($cut -lt 600) { $cut = 1200 } else { $cut += 1 }
        $pieces.Add($text.Substring(0, $cut).Trim()); $text = $text.Substring($cut).Trim()
      }
      if ($text.Length -ge 80) { $pieces.Add($text) }
      foreach ($piece in $pieces) {
        $tokens = Get-Tokens $piece
        if ($tokens.Count -lt 8) { continue }
        $tf = @{}
        foreach ($t in $tokens) { if ($tf.ContainsKey($t)) { $tf[$t]++ } else { $tf[$t] = 1 } }
        foreach ($k in $tf.Keys) {
          $list = $null
          if (-not $postings.TryGetValue($k, [ref]$list)) { $list = New-Object System.Collections.Generic.List[int]; $postings[$k] = $list }
          $list.Add($chunkId); $list.Add([int]$tf[$k])
        }
        $chunkLens.Add($tokens.Count)
        [void]$shard.Append('[' + $d + ',' + ($p + 1) + ',' + (ConvertTo-JStr $piece) + '],')
        $chunkId++; $inShard++
        if ($inShard -ge $ChunkShardSize) { . $flush }
      }
    }
    if (-not $hadText) { $noText++ }
  }
  . $flush
  Remove-Item -LiteralPath $tmpTxt -Force -ErrorAction SilentlyContinue
  Write-Progress -Activity 'Indexing field manuals' -Completed

  # term shards
  $shards = @{}
  foreach ($kv in $postings.GetEnumerator()) {
    $sid = Get-TermShard $kv.Key
    if (-not $shards.ContainsKey($sid)) { $shards[$sid] = New-Object System.Text.StringBuilder }
    $df = [int]($kv.Value.Count / 2)
    [void]$shards[$sid].Append('"' + $kv.Key + '":[' + $df + ',[' + ($kv.Value -join ',') + ']],')
  }
  for ($i = 0; $i -lt $TermShards; $i++) {
    $body = if ($shards.ContainsKey($i)) { $shards[$i].ToString().TrimEnd(',') } else { '' }
    Write-Utf8 (Join $outDir ("terms-$i.json")) ('{' + $body + '}')
  }
  $avg = if ($chunkLens.Count) { ($chunkLens | Measure-Object -Average).Average } else { 0 }
  $meta = '{"v":' + $IndexVersion + ',"stamp":"' + $stamp + '","n":' + $chunkId + ',"avgdl":' + ([math]::Round($avg, 2)).ToString([System.Globalization.CultureInfo]::InvariantCulture) +
    ',"shardSize":' + $ChunkShardSize + ',"termShards":' + $TermShards + ',"docs":[' + ($docs -join ',') + '],"len":[' + ($chunkLens -join ',') + ']}'
  Write-Utf8 $metaPath $meta
  Say ("   indexed {0} passages from {1} documents ({2} had no searchable text, e.g. image-only scans)" -f $chunkId, ($manualList.Count - $noText), $noText)
  return (Read-Json $metaPath)
}

function Get-BookRows([string]$tier, [string]$use = $Use) {
  if (-not $tier -or $tier -eq 'none' -or -not $manifest.books) { return @() }
  $listPath = Join $GoDir $manifest.books.list
  if (-not (Test-Path -LiteralPath $listPath)) { return @() }
  $cats = @($manifest.books.tiers.$tier)
  $all = $cats -contains '*'
  $allowed = @($manifest.books.uses.$use)
  return @(Import-Csv -LiteralPath $listPath -Encoding UTF8 | Where-Object { $allowed -contains $_.decision -and ($all -or $cats -contains $_.category) })
}
function Find-BookSource($row) {
  foreach ($folder in @($BooksFolder)) {
    $p = Join $folder $row.file
    if (Test-Path -LiteralPath $p -PathType Leaf) { return (Get-Item -LiteralPath $p) }
  }
  return $null
}
function Get-BookDest($row) { Join $Target ('Library/Books/' + $row.file) }

# ------------------------------------------------------------------ plan
$manifest = Read-Json $ManifestPath
$colWiki = Read-Json (Join $GoDir $manifest.collections.wikipedia)
$colZim = Read-Json (Join $GoDir $manifest.collections.zim_categories)
$colMaps = Read-Json (Join $GoDir $manifest.collections.maps)
if ($DownloadOnly) {
  if (-not $CacheDir) { throw "-DownloadOnly needs -CacheDir, the folder that keeps every download, e.g. -CacheDir 'G:\RhinoVault Project\Downloads'" }
  if (-not $LocalMirror) { $LocalMirror = $CacheDir }   # keep what is already there
} else {
  if (-not $Drive) { throw 'Give -Drive: the USB drive or folder to build, e.g. -Drive E:' }
  if ($Edition -eq 'all') { throw "-Edition all only works with -DownloadOnly. Build a drive with lite, standard or full." }
}
$editions = if ($Edition -eq 'all') { @('lite', 'standard', 'full') } else { @($Edition) }

$plan = New-Object System.Collections.Generic.List[object]
function Add-Plan($item) { if (-not ($plan | Where-Object { $_.Kind -eq $item.Kind -and $_.Id -eq $item.Id })) { $plan.Add([pscustomobject]$item) } }

foreach ($ed in $editions) {
$prof = $manifest.profiles.$ed

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
# -BooksFolder "a","b" arrives as one string from pwsh -File / .cmd callers; split it unless it's one real folder
if ($BooksFolder -and @($BooksFolder).Count -eq 1 -and -not (Test-Path -LiteralPath $BooksFolder[0]) -and $BooksFolder[0] -match '[,;]') {
  $BooksFolder = @($BooksFolder[0] -split '\s*[,;]\s*' | Where-Object { $_ })
}
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

# Ebooks from a local folder (public domain titles only, see books/ebooks.csv)
$bookTier = if ($Books) { $Books } elseif ($prof.books) { $prof.books } else { 'none' }
$indexTier = if ($IndexBooks) { $IndexBooks } elseif ($manifest.books.index_tiers) { @($manifest.books.index_tiers)[0] } else { 'none' }
$bookRows = @()
if ($bookTier -ne 'none') {
  if ($BooksFolder) {
    foreach ($bf in @($BooksFolder)) { if (-not (Test-Path -LiteralPath $bf)) { throw "Books folder not found: $bf" } }
    $bookRows = Get-BookRows $bookTier
    $useLabel = @{ sale = 'public domain only'; free = 'public domain + free-to-share'; personal = 'personal use' }[$Use]
    Add-Plan @{ Kind = 'books'; Id = "books-$bookTier"; Title = "Ebooks ($bookTier tier, $($bookRows.Count) titles, $useLabel)"; Category = 'Books'
      SizeMB = [double](($bookRows | Measure-Object -Property size_mb -Sum).Sum); Verify = $false }
  } else {
    Say "  (no -BooksFolder given, so the $bookTier ebook tier is skipped)" DarkGray
  }
}

# Offline AI model
$aiModel = $null
if (-not $NoAI -and $prof.ai_model) {
  $aiModel = $manifest.ai_models.($prof.ai_model)
  if ($aiModel) {
    Add-Plan @{ Kind = 'model'; Id = $prof.ai_model; Title = "AI model: $($aiModel.title)"; Category = 'AI'
      SizeMB = [double]$aiModel.approx_mb; Spec = $aiModel; Verify = $false }
  }
}

}  # editions

# Runtime binaries for every platform, so the drive works on Windows, Mac and Linux
foreach ($rt in $manifest.runtime) {
  if ($NoAI -and $rt.id -eq 'llama-server') { continue }
  foreach ($pl in (Props $rt.platforms)) {
    Add-Plan @{ Kind = 'runtime'; Id = "$($rt.id)-$($pl.Name)"; Title = "$($rt.title) [$($pl.Name)]"; Platform = $pl.Name
      SizeMB = 15; Spec = $rt; PlatformSpec = $pl.Value; Verify = $false }
  }
}

# ------------------------------------------------------------------ download only
if ($DownloadOnly) {
  New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
  $Target = (Resolve-Path -LiteralPath $CacheDir).Path
  $items = @($plan | Where-Object Kind -ne 'books')
  Write-Host ''
  Write-Host '  RhinoVault Go downloader' -ForegroundColor Yellow -NoNewline; Write-Host "  v$GoVersion" -ForegroundColor DarkGray
  Say "  Editions : $($editions -join ', ')"
  Say "  Saving to: $Target"
  Say "  Checking for the newest library files..." DarkGray
  foreach ($it in @($items | Where-Object Kind -eq 'zim')) { $new = Resolve-LatestZim $it.Url; if ($new -ne $it.Url) { $it.Url = $new } }
  $totalMB = ($items | Measure-Object SizeMB -Sum).Sum
  $have = @(Get-ChildItem -LiteralPath $Target -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB
  $psd = Get-PSDrive -Name ((Get-Item -LiteralPath $Target).PSDrive.Name) -ErrorAction SilentlyContinue
  $freeMB = if ($psd) { [math]::Floor($psd.Free / 1MB) } else { [double]::MaxValue }
  Say "  Content  : $($items.Count) items, about $(Fmt $totalMB) in all ($(Fmt $have) already in the folder, $(Fmt $freeMB) free)"
  if ($DryRun) {
    Step 'Dry run - everything that belongs in the folder'
    foreach ($it in $items) { Say ('  [{0,-7}] {1,-60} {2,10}' -f $it.Kind, $it.Title, (Fmt $it.SizeMB)) }
    return
  }
  if (-not $Force -and ($totalMB - $have) * 1.05 -gt $freeMB) {
    throw "Not enough space: about $(Fmt (($totalMB - $have) * 1.05)) more is needed, $(Fmt $freeMB) free. Free up space or use -Force."
  }
  $failed = @(); $i = 0
  foreach ($it in $items) {
    $i++
    Step ("[{0}/{1}] {2}" -f $i, $items.Count, $it.Title)
    try {
      $res = switch ($it.Kind) {
        'zim' { @{ Url = $it.Url; FileName = (FileNameFromUrl $it.Url); Mirror = (Find-InMirror (FileNameFromUrl $it.Url) $null) } }
        'map' { @{ Url = $it.Url; FileName = (FileNameFromUrl $it.Url); Mirror = (Find-InMirror (FileNameFromUrl $it.Url) $null) } }
        'model' { @{ Urls = @($it.Spec.urls); FileName = $it.Spec.file; Mirror = (Find-InMirror $it.Spec.file $null) } }
        'extra' { Resolve-Source $it.Spec.source $null $it.Spec.file }
        'runtime' { Resolve-Source $it.Spec.source $it.PlatformSpec $null }
      }
      $dest = Join $Target $res.FileName
      if ($res.Mirror -or (Test-Path -LiteralPath $dest)) { Say '   already downloaded' DarkGreen; continue }
      $used = Get-Remote $res $dest
      if ($it.Verify) { Test-Sha256 $used $dest }
      Say '   saved' DarkGreen
    } catch {
      Say "   FAILED: $($_.Exception.Message)" Red
      $failed += $it
    }
  }
  # pdftotext (Poppler) builds the field-manual search index on Windows
  $pop = $manifest.build_tools.'poppler-windows'
  if ($pop) {
    Step 'pdftotext (Poppler) for the field-manual search index'
    try {
      $res = Resolve-Source $pop.source $null $null
      $dest = Join $Target $res.FileName
      if ($res.Mirror -or (Test-Path -LiteralPath $dest)) { Say '   already downloaded' DarkGreen } else { $null = Get-Remote $res $dest; Say '   saved' DarkGreen }
    } catch { Say "   FAILED: $($_.Exception.Message)" Red; $failed += [pscustomobject]@{ Title = 'pdftotext (Poppler)' } }
  }
  Write-Host ''
  if ($failed.Count) {
    Say "  $($failed.Count) item(s) failed - run the same command again to retry:" Red
    $failed | ForEach-Object { Say "   - $($_.Title)" Red }
  } else {
    Say '  Everything is downloaded. Build drives from this folder with:' Green
    Say "  .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard -LocalMirror `"$Target`"" Green
  }
  Say '  Ebooks are not downloaded here: copy your books folders to G: and pass them with -BooksFolder.' DarkGray
  return
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

$zims = @($plan | Where-Object Kind -eq 'zim')
if ($zims.Count) { Say "  Checking for the newest library files ($($zims.Count))..." DarkGray }
foreach ($it in $zims) {
  $new = Resolve-LatestZim $it.Url
  if ($new -ne $it.Url) { Say "   $($it.Title): $(FileNameFromUrl $it.Url) -> $(FileNameFromUrl $new)" DarkGray; $it.Url = $new }
}

# Work out what still needs downloading
$todo = @(); $needMB = 0
foreach ($it in $plan) {
  $done = switch ($it.Kind) {
    'zim' { Test-Path -LiteralPath (Get-ZimPath $it) }
    'map' { Test-Path -LiteralPath (Get-MapPath $it) }
    'model' { Test-Path -LiteralPath (Join $Target ('AI/models/' + $it.Spec.file)) }
    'books' { $false }
    default { (Test-Path -LiteralPath (Get-Marker $it)) }
  }
  if ($it.Kind -eq 'books') {
    $missing = @($bookRows | Where-Object { -not (Test-Path -LiteralPath (Get-BookDest $_)) })
    if ($missing.Count) { $todo += $it; $needMB += ($missing | Measure-Object -Property size_mb -Sum).Sum }
    continue
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
  $label = @{ zim = 'Library collections'; map = 'Map regions'; extra = 'Extras'; runtime = 'Runtime tools'; model = 'AI model'; books = 'Ebooks' }[$_.Name]
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
      'books' {
        $copied = 0; $skipped = 0; $missingSrc = 0; $n = 0
        foreach ($row in $bookRows) {
          $n++
          $dst = Get-BookDest $row
          $srcItem = Find-BookSource $row
          if (-not $srcItem) { $missingSrc++; continue }
          $dstItem = Get-Item -LiteralPath $dst -ErrorAction SilentlyContinue
          if ($dstItem -and $dstItem.Length -eq $srcItem.Length) { $skipped++; continue }
          if ($n % 25 -eq 0) { Write-Progress -Activity 'Copying ebooks' -Status $row.title -PercentComplete (100 * $n / $bookRows.Count) }
          New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
          Copy-Item -LiteralPath $srcItem.FullName -Destination $dst -Force
          $copied++
        }
        Write-Progress -Activity 'Copying ebooks' -Completed
        Say "   $copied copied, $skipped already on drive$(if ($missingSrc) { ", $missingSrc not found in the books folder" })"
        # Never leave material on a drive that its -Use doesn't allow (e.g. a personal build reused for sale)
        $notAllowed = @(Get-BookRows 'all' 'personal' | Where-Object { @($manifest.books.uses.$Use) -notcontains $_.decision })
        foreach ($r in $notAllowed) {
          $p = Get-BookDest $r
          if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force; Say "   removed (not allowed for -Use $Use): $($r.title)" DarkYellow }
        }
      }
      'model' {
        $dest = Join $Target ('AI/models/' + $it.Spec.file)
        if (Test-Path -LiteralPath $dest) { Say '   already on drive' DarkGreen; break }
        $res = @{ Urls = @($it.Spec.urls); FileName = $it.Spec.file; Mirror = (Find-InMirror $it.Spec.file $null) }
        # Only one model lives on the drive; drop an older one when the edition's model changes
        Get-ChildItem -LiteralPath (Join $Target 'AI/models') -Filter *.gguf -File -ErrorAction SilentlyContinue |
          Where-Object { $_.Name -ne $it.Spec.file } | ForEach-Object { Say "   replacing old model $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Force }
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
            elseif (-not (Test-Path -LiteralPath $archive)) { $null = Get-Remote $res $archive }
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
          if (-not $res.Mirror -and -not (Test-Path -LiteralPath $archive)) { $null = Get-Remote $res $archive }
          $x = Join $tmp 'x'; Expand-Any $archive $x
          $binDir = Join $Target ("RhinoVault/bin/" + $it.Platform)
          if ($it.Spec.subdir) { $binDir = Join $binDir $it.Spec.subdir }
          if ($it.Spec.keep_all -and (Test-Path -LiteralPath $binDir)) { Remove-Item -LiteralPath $binDir -Recurse -Force }
          New-Item -ItemType Directory -Force -Path $binDir | Out-Null
          $kept = 0
          if ($it.Spec.keep_all) {
            $srcRoot = Get-StrippedRoot $x 1
            Get-ChildItem -LiteralPath $srcRoot -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $binDir -Recurse -Force; $kept++ }
          }
          foreach ($pat in @($it.Spec.keep | Where-Object { $_ })) {
            Get-ChildItem -LiteralPath $x -Recurse -File -Filter $pat | ForEach-Object {
              Copy-Item -LiteralPath $_.FullName -Destination (Join $binDir $_.Name) -Force; $kept++
            }
          }
          if ($kept -eq 0) { throw "No usable files found in $($res.FileName)" }
          Say "   $kept file(s) -> $($binDir.Substring($Target.Length).TrimStart('\', '/'))"
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
  if ($BooksFolder -or $bookTier -eq 'none') {
    $keepBooks = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($r in $bookRows) { [void]$keepBooks.Add(((Get-BookDest $r) -replace '\\', '/')) }
    Get-ChildItem -LiteralPath (Join $Target 'Library/Books') -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { -not $keepBooks.Contains(($_.FullName -replace '\\', '/')) } | ForEach-Object { Say "   removing book $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Force }
  }
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

# Books on the drive (whatever is there, so a drive built earlier keeps its list without -BooksFolder)
$bookList = @(Get-BookRows 'all' 'personal' | Where-Object { Test-Path -LiteralPath (Get-BookDest $_) } | ForEach-Object {
  [ordered]@{ title = $_.title; category = $_.category; year = $_.year; size_mb = [double]$_.size_mb; file = 'Library/Books/' + ($_.file -replace '\\', '/') }
})
$indexCats = if ($indexTier -eq 'none') { @() } else { @($manifest.books.tiers.$indexTier) }
$booksToIndex = @($bookList | Where-Object { $indexCats -contains '*' -or $indexCats -contains $_.category } |
  ForEach-Object { [ordered]@{ title = $_.title; branch = $_.category; size_mb = $_.size_mb; file = $_.file } })

Step "Building the Ask RhinoVault search index (field manuals + $($booksToIndex.Count) books)"
$indexMeta = $null
try { $indexMeta = Build-ManualIndex (@($manuals) + @($booksToIndex)) (Join $Target 'RhinoVault/ai/index') }
catch { Say "   index build failed: $($_.Exception.Message)" Red }

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
if ($bookList.Count) { $credits += 'Ebooks: public domain titles (published before 1931, U.S. government works, or U.S. books whose copyright was not renewed), mostly digitized by the Internet Archive and its partner libraries.' }
if ($Use -ne 'sale') { $credits += "Where There Is No Doctor / Dentist (c) Hesperian Health Guides, shared under Hesperian's free-distribution terms. Not for sale." }
if ($Use -eq 'personal') { $credits += 'Checklists (c) 2024 trueprepper.com, for personal use only.' }

$modelFile = Get-ChildItem -LiteralPath (Join $Target 'AI/models') -Filter *.gguf -File -ErrorAction SilentlyContinue | Select-Object -First 1
$modelSpec = $null
if ($modelFile) { foreach ($mp in (Props $manifest.ai_models)) { if ($mp.Value.file -eq $modelFile.Name) { $modelSpec = $mp.Value } } }
$ai = [ordered]@{
  model_file = if ($modelFile) { "AI/models/$($modelFile.Name)" } else { $null }
  model_title = if ($modelSpec) { $modelSpec.title } elseif ($modelFile) { $modelFile.BaseName } else { $null }
  model_license = if ($modelSpec) { $modelSpec.license } else { $null }
  context = if ($modelSpec) { [int]$modelSpec.context } else { 4096 }
  index = [bool]$indexMeta
  passages = if ($indexMeta) { [int]$indexMeta.n } else { 0 }
}
if ($modelSpec) { $credits += "AI model: $($modelSpec.credit). Runs on llama.cpp (MIT)." }

$index = [ordered]@{
  version = $GoVersion; edition = $Edition; profile_label = $prof.label; use = $Use
  built = (Get-Date).ToUniversalTime().ToString('o')
  zims = $zims; manuals = $manuals; books = $bookList; maps = $maps; tools = $tools; apps = $apps; isos = $isos; ai = $ai; credits = $credits
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
Content: $($zims.Count) library collections, $($manuals.Count) field manuals, $($bookList.Count) ebooks, $($maps.Count) map regions
"@
[System.IO.File]::WriteAllText((Join $Target 'README - Start Here.txt'), ($readme -replace "`r?`n", "`r`n"), (New-Object System.Text.UTF8Encoding($false)))

Step 'Done'
Say ("  {0} library collections, {1} field manuals, {2} ebooks, {3} map regions, {4} tools, {5} apps, {6} ISOs" -f `
  $zims.Count, $manuals.Count, $bookList.Count, $maps.Count, $tools.Count, $apps.Count, $isos.Count) Green
if ($failed.Count) {
  Say "  $($failed.Count) item(s) failed - run the same command again to retry:" Red
  $failed | ForEach-Object { Say "   - $($_.Title)" Red }
  exit 1
}
Say '  The drive is ready. Eject it safely before unplugging.' Green
