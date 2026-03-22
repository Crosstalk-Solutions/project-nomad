# Electron App Icons

Place the following icon files here for the packaged desktop app:

| File            | Size        | Platform       |
|-----------------|-------------|----------------|
| `icon.png`      | 512×512 px  | Linux (AppImage, deb) |
| `tray-icon.png` | 32×32 px    | System tray (all platforms) |
| `icon.icns`     | macOS bundle | macOS         |
| `icon.ico`      | Multi-size ICO | Windows     |

The `tray-icon.png` is also used as a fallback tray icon during development.
If it is missing, Electron will use a blank 1×1 image and the tray entry will
still appear (just without a visible icon).
