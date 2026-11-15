RhinoVault Go - Ventoy theme
============================
1. Copy the "ventoy" folder to the root of the Ventoy data partition
   (the big exFAT partition where your ISOs live).
   If you already have ventoy/ventoy.json, merge in the "theme" section
   instead of replacing the file.
2. Boot the USB. The RhinoVault theme loads at 1920x1080.
3. On older or smaller screens, change "gfxmode" in ventoy.json to "max"
   or "1024x768" (the background scales to fit).

Files: background.png (1920x1080), theme.txt, DejaVu Sans GRUB fonts (.pf2),
and the menu highlight / scrollbar pieces (select_*, slider_*, scrollframe_*).
