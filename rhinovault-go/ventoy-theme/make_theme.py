import os, random, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(HERE, "ventoy/theme/rhinovault")
os.makedirs(OUT, exist_ok=True)
W, H = 1920, 1080
# Usage: python make_theme.py path\to\rhinovault_logo.png  (transparent PNG, square)
LOGO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "rhinovault_logo.png")
INTER = "/usr/share/fonts/opentype/inter/Inter-{}.otf"
DEJ = "/usr/share/fonts/truetype/dejavu/DejaVuSans{}.ttf"

SLATE0, SLATE1 = (24, 30, 33), (44, 54, 58)
OLIVE = (134, 148, 102)
OLIVE_DK = (94, 110, 63)
SAND = (214, 205, 182)
BROWN = (138, 112, 84)
CREAM = (240, 236, 224)

# --- base: vertical-diagonal gradient
bg = Image.new("RGB", (W, H))
px = bg.load()
for y in range(H):
    for x in range(0, W):
        t = min(1, max(0, (x * 0.35 + y) / (W * 0.35 + H)))
        px[x, y] = tuple(int(SLATE1[i] + (SLATE0[i] - SLATE1[i]) * t) for i in range(3))

# --- circuit traces (deterministic)
layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
rnd = random.Random(7)
for _ in range(70):
    x = rnd.randint(-40, W)
    y = rnd.randint(0, H)
    col = OLIVE + (rnd.randint(18, 40),) if rnd.random() < 0.7 else BROWN + (rnd.randint(18, 36),)
    pts = [(x, y)]
    for _ in range(rnd.randint(2, 4)):
        if rnd.random() < 0.5:
            x += rnd.choice([-1, 1]) * rnd.randint(60, 220)
        else:
            y += rnd.choice([-1, 1]) * rnd.randint(40, 160)
        pts.append((x, y))
    d.line(pts, fill=col, width=2)
    ex, ey = pts[-1]
    d.ellipse([ex - 5, ey - 5, ex + 5, ey + 5], outline=col, width=2)
bg = Image.alpha_composite(bg.convert("RGBA"), layer)

# --- soft glow behind logo
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([120, 120, 700, 700], fill=OLIVE + (70,))
bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(120)))

# --- logo
logo = Image.open(LOGO).convert("RGBA").resize((470, 470), Image.LANCZOS)
bg.alpha_composite(logo, (175, 140))

d = ImageDraw.Draw(bg)
f_title = ImageFont.truetype(INTER.format("ExtraBold"), 84)
f_tag = ImageFont.truetype(INTER.format("Medium"), 30)
f_small = ImageFont.truetype(INTER.format("SemiBold"), 20)
f_feat = ImageFont.truetype(INTER.format("Regular"), 22)

cx = 410
d.text((cx, 650), "RhinoVault", font=f_title, fill=CREAM, anchor="mm")
d.text((cx, 735), "G O", font=ImageFont.truetype(INTER.format("Bold"), 40), fill=OLIVE, anchor="mm")
d.text((cx, 800), "Offline knowledge. Anywhere.", font=f_tag, fill=SAND, anchor="mm")
d.line([(cx - 150, 845), (cx + 150, 845)], fill=BROWN, width=2)
d.text((cx, 878), "LIBRARY  •  FIELD MANUALS  •  MAPS  •  OFFLINE AI", font=f_small, fill=(170, 178, 150), anchor="mm")

# --- menu panel (GRUB draws the menu inside it)
panel = Image.new("RGBA", (W, H), (0, 0, 0, 0))
pd = ImageDraw.Draw(panel)
P = (860, 130, 1800, 930)
pd.rounded_rectangle(P, radius=18, fill=(16, 20, 22, 170), outline=OLIVE + (150,), width=2)
bg = Image.alpha_composite(bg, panel)
d = ImageDraw.Draw(bg)
d.text((P[0] + 44, P[1] + 46), "SELECT A SYSTEM TO BOOT", font=f_small, fill=OLIVE, anchor="lm")
d.line([(P[0] + 44, P[1] + 78), (P[2] - 44, P[1] + 78)], fill=(70, 80, 70), width=1)
d.text((P[0] + 44, P[3] - 36), "↑ ↓  choose     Enter  boot", font=ImageFont.truetype(INTER.format("Regular"), 18), fill=(150, 156, 140), anchor="lm")
d.text((W - 60, H - 36), "RhinoPCTec", font=f_small, fill=(120, 128, 112), anchor="rm")

bg.convert("RGB").save(f"{OUT}/background.png", optimize=True)


# --- 9-slice highlight + scrollbar pieces
def nine(prefix, fill, edge, r=8):
    big = Image.new("RGBA", (r * 3, r * 3), (0, 0, 0, 0))
    ImageDraw.Draw(big).rounded_rectangle([0, 0, r * 3 - 1, r * 3 - 1], radius=r, fill=fill, outline=edge, width=2)
    parts = {"nw": (0, 0), "n": (1, 0), "ne": (2, 0), "w": (0, 1), "c": (1, 1), "e": (2, 1), "sw": (0, 2), "s": (1, 2), "se": (2, 2)}
    for k, (i, j) in parts.items():
        big.crop((i * r, j * r, (i + 1) * r, (j + 1) * r)).save(f"{OUT}/{prefix}_{k}.png")


nine("select", OLIVE_DK + (235,), OLIVE + (255,))
nine("slider", OLIVE + (200,), OLIVE + (255,), r=4)
nine("scrollframe", (255, 255, 255, 18), (255, 255, 255, 30), r=4)

# --- GRUB fonts
for size, src, name in [(16, DEJ.format(""), "dejavu_sans_16"), (20, DEJ.format(""), "dejavu_sans_20"),
                        (20, DEJ.format("-Bold"), "dejavu_sans_bold_20")]:
    subprocess.run(["grub-mkfont", "-s", str(size), "-o", f"{OUT}/{name}.pf2", src], check=True)

# --- theme.txt
L, T, MW, MH = 860 + 44, 130 + 98, 940 - 88, 800 - 98 - 70
theme = f'''# RhinoVault Go - Ventoy / GRUB theme (1920x1080, whole-pixel positions)
title-text: ""
desktop-image: "background.png"
desktop-color: "#1E2528"
terminal-font: "DejaVu Sans Regular 16"
terminal-left: "0"
terminal-top: "0"
terminal-width: "1920"
terminal-height: "1080"
terminal-border: "0"

+ boot_menu {{
    left = {L}
    top = {T}
    width = {MW}
    height = {MH}
    item_font = "DejaVu Sans Regular 20"
    item_color = "#D6CDB6"
    selected_item_font = "DejaVu Sans Bold 20"
    selected_item_color = "#FFFFFF"
    selected_item_pixmap_style = "select_*.png"
    item_height = 42
    item_padding = 14
    item_spacing = 6
    item_icon_space = 0
    scrollbar = true
    scrollbar_width = 8
    scrollbar_frame = "scrollframe_*.png"
    scrollbar_thumb = "slider_*.png"
}}

# Ventoy hotkey tips and memdisk status
+ label {{
    top = 1026
    left = 0
    width = 1920
    height = 24
    align = "center"
    font = "DejaVu Sans Regular 16"
    color = "#9AA58A"
    text = "@VTOY_HOTKEY_TIP@"
}}

+ label {{
    top = 994
    left = 0
    width = 1920
    height = 24
    align = "center"
    font = "DejaVu Sans Regular 16"
    color = "#C9A66B"
    text = "@VTOY_MEM_DISK@"
}}
'''
open(f"{OUT}/theme.txt", "w").write(theme)

# --- ventoy.json
import json
cfg = {"theme": {"file": "/ventoy/theme/rhinovault/theme.txt", "gfxmode": "1920x1080", "display_mode": "GUI",
                 "fonts": ["/ventoy/theme/rhinovault/dejavu_sans_16.pf2", "/ventoy/theme/rhinovault/dejavu_sans_20.pf2",
                           "/ventoy/theme/rhinovault/dejavu_sans_bold_20.pf2"]}}
json.dump(cfg, open(os.path.join(HERE, "ventoy/ventoy.json"), "w"), indent=2)

# --- preview with a sample menu drawn in
pv = Image.open(f"{OUT}/background.png").convert("RGBA")
pd = ImageDraw.Draw(pv)
fi = ImageFont.truetype(DEJ.format(""), 20)
fb = ImageFont.truetype(DEJ.format("-Bold"), 20)
items = ["ubuntu-24.04.3-desktop-amd64.iso", "Win11_24H2_English_x64.iso", "rescuezilla-2.6-64bit.iso",
         "memtest86-usb.img", "clonezilla-live-3.2.iso"]
y = T
for i, it in enumerate(items):
    if i == 0:
        pd.rounded_rectangle([L, y, L + MW, y + 42], radius=8, fill=OLIVE_DK + (235,), outline=OLIVE, width=2)
    pd.text((L + 14, y + 21), it, font=fb if i == 0 else fi, fill=(255, 255, 255) if i == 0 else SAND, anchor="lm")
    y += 48
pd.text((W / 2, H * 0.95 + 12), "F1:Help  F2:Browse  F3:TreeView  F4:Localboot  F5:Tools  F6:ExMenu", font=ImageFont.truetype(DEJ.format(""), 16), fill=(154, 165, 138), anchor="mm")
pv.convert("RGB").save(os.path.join(HERE, "RhinoVault-Ventoy-preview.png"))
print("done", L, T, MW, MH)
