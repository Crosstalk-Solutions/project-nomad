# RhinoVault Go

The portable edition of RhinoVault: a USB drive that carries an offline library, U.S. military field manuals, an offline AI assistant, offline maps, tools and apps, with a branded launcher that runs on **Windows, Mac and Linux** without installing anything.

RhinoVault Go uses the same content collections as the RhinoVault server (`../collections`), so a drive and a server built on the same day carry the same library.

## What's on a drive

| Folder | Contents |
|---|---|
| `Start RhinoVault (Windows).cmd` / `(Mac).command` / `(Linux).sh` | Double-click to start. Opens the launcher in the browser. |
| `Share RhinoVault on Network (Windows).cmd` | Same, but other devices on the Wi-Fi can open it too. |
| `Library/ZIM` | Kiwix library: Wikipedia, medicine, survival, repair, farming, education, computing |
| `Library/Field-Manuals` | ~180 public-domain U.S. military field manuals (PDF) |
| `AI/models` | The offline AI model (GGUF) used by Ask RhinoVault |
| `Maps` | Offline U.S. state maps (PMTiles) plus styles and fonts |
| `Tools/CyberChef` | Encoding, encryption and hashing in the browser |
| `Apps/Windows` | Portable apps (KeePassXC) |
| `ISOs` | Bootable systems (Full edition), used with Ventoy |
| `RhinoVault/` | Launcher, start scripts and the small servers for each OS |

## Editions

| Edition | Wikipedia | Library tiers | Maps | Size | Drive |
|---|---|---|---|---|---|
| `lite` | Popular articles (no images) | Essential | All U.S. states | ~29 GB | 64 GB |
| `standard` | Complete (no images) | Standard | All U.S. states | ~102 GB | 128 GB |
| `full` | Complete with images | Comprehensive | All U.S. states + Ubuntu ISO | ~224 GB | 256 GB min, 512 GB recommended |

AI model per edition: **Lite** uses Qwen2.5 1.5B Instruct (~1.1 GB, runs on 4 GB RAM machines); **Standard** and **Full** use Qwen3 4B Instruct 2507 (~2.5 GB, best with 8 GB RAM). Both are Apache-2.0, so they can be included on drives you sell.

Edit `manifest.json` to change what each edition contains.

## Building a drive (Windows)

1. **Format the USB drive as exFAT.** FAT32 can't hold files over 4 GB. For bootable ISOs, install [Ventoy](https://www.ventoy.net) on the drive first and choose exFAT.
2. Open PowerShell in `rhinovault-go\build` and preview the build:
   ```powershell
   .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard -DryRun
   ```
3. Build it:
   ```powershell
   .\Build-RhinoVaultGo.ps1 -Drive E: -Edition standard
   ```
   Or double-click `Build-RhinoVaultGo.cmd` and type the drive when asked.

Downloads resume where they stopped. If anything fails, run the same command again; finished items are skipped. Run it again later to **update** a drive to the latest content.

### Useful options

| Option | What it does |
|---|---|
| `-MapRegions texas,illinois` | Only these states. Region names also work (`west-south-central`, `east-north-central`), or `none`. |
| `-CacheDir D:\RhinoVaultCache` | Keep downloads and copy them to each drive, so making several client drives only downloads once. |
| `-LocalMirror \\nas\rhinovault` | Use files you already have (ZIMs, maps, archives) from a folder or NAS share instead of downloading. |
| `-Prune` | Remove library and map files that are no longer part of the edition. |
| `-SkipHashCheck` | Skip SHA-256 verification of library files (faster, less safe). |
| `-NoAI` | Leave out the AI engine and model (the field manual search index is still built). |
| `-Force` | Build even if the free-space check says the drive is too small. |

## Using a drive

Double-click the start file for the computer you're on. A small window shows the address, and the browser opens the launcher. Press **Enter** in that window to stop, then eject the drive.

- **Mac:** the first time, right-click `Start RhinoVault (Mac).command` and choose **Open**, because macOS blocks downloaded scripts by default.
- **Sharing:** the "Share on Network" start file binds to all network interfaces and prints addresses that phones and laptops on the same network can open.
- **Booting:** on a Ventoy drive, restart the computer, open its boot menu (F12, F11, Esc, or Option on a Mac) and choose the USB drive. Ventoy lists the ISOs.

## Ask RhinoVault (offline AI)

The **Ask AI** page is a chat assistant that runs entirely on the computer the drive is plugged into. No internet, no account, nothing leaves the machine.

- When you ask a question, it first searches the field manuals on the drive, then the AI answers using the best matching pages and cites them as [1], [2]. Each source links to the exact PDF page.
- Untick **Search the field manuals** for general questions.
- It runs on the processor (no graphics card needed). Expect a few words per second on a typical laptop; Apple Silicon Macs are faster.
- The start scripts check memory first and skip the AI on computers that don't have enough, leaving everything else working. Start with `-NoAI` (Windows) or `--no-ai` (Mac/Linux) to turn it off.

The builder creates the search index from the manuals' text with `pdftotext` (downloaded automatically on Windows; install `poppler-utils` on Linux or `poppler` via Homebrew on Mac). Scanned manuals without a text layer are still on the drive but can't be searched by the AI.

## How it works

- `kiwix-serve` serves the library on port 8090 and `llama-server` (llama.cpp) runs the AI on port 8091. `static-web-server` serves the launcher, manuals and maps on port 8088 with byte-range support, which offline maps need. Both bind to `127.0.0.1` unless you choose sharing, and move to the next free port if one is taken.
- The builder writes `RhinoVault/launcher/library.json`, which the launcher reads. Nothing in the launcher needs the internet.
- The maps page uses MapLibre GL JS and PMTiles with the Protomaps style, the same map stack as the RhinoVault server.

## Credits and licenses

RhinoVault Go is part of RhinoVault by RhinoPCTec, based on Project N.O.M.A.D. by Crosstalk Solutions, LLC (Apache-2.0). It bundles or downloads llama.cpp (MIT), the Qwen AI models (Apache-2.0), Kiwix tools (GPL-3.0), Static Web Server (Apache-2.0/MIT), MapLibre GL JS and PMTiles (BSD-3-Clause), CyberChef (Apache-2.0) and KeePassXC (GPL-3.0). Library content belongs to its publishers under their licenses (e.g. Wikipedia, CC BY-SA). Map data © OpenStreetMap contributors (ODbL). Field manuals are U.S. government works from the Internet Archive collection *military-field-manuals-and-guides*.
