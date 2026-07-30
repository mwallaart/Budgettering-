#!/usr/bin/env python3
"""PWA-iconen in de Huishoudboekje-stijl: gouden munt op dennengroen."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Achtergrond: hero-gradient uit het ontwerp
TOP = (28, 83, 65)     # #1C5341
BOT = (15, 50, 39)     # #0F3227
# Munt: goudtinten uit het ontwerp
GOLD_LIGHT = (247, 230, 174)   # #F7E6AE
GOLD_MID = (216, 180, 92)      # #D8B45C
GOLD_DARK = (181, 135, 44)     # #B5872C
GOLD_RING = (230, 193, 95)     # #E6C15F
INK = (107, 78, 20)            # #6B4E14


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def coin(big, cx, cy, r):
    """Gouden munt met ring, verloop en glans-highlight."""
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # buitenring
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GOLD_RING + (255,))
    # binnenvlak met verticaal verloop
    ir = int(r * 0.88)
    inner = Image.new("RGBA", (ir * 2, ir * 2), (0, 0, 0, 0))
    ip = inner.load()
    for y in range(ir * 2):
        c = lerp(GOLD_LIGHT, GOLD_DARK, min(1.0, y / (ir * 2) * 1.15))
        for x in range(ir * 2):
            ip[x, y] = c + (255,)
    mask = Image.new("L", (ir * 2, ir * 2), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, ir * 2 - 1, ir * 2 - 1], fill=255)
    inner.putalpha(mask)
    layer.alpha_composite(inner, (cx - ir, cy - ir))

    # zachte glans linksboven
    hi = Image.new("L", (big, big), 0)
    ImageDraw.Draw(hi).ellipse([cx - r * 0.85, cy - r * 1.0, cx + r * 0.15, cy - r * 0.1], fill=90)
    hi = hi.filter(ImageFilter.GaussianBlur(r * 0.18))
    white = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    white.putalpha(hi)
    layer.alpha_composite(white)
    return layer


def make_icon(size, radius_ratio, coin_ratio=0.62):
    ss = 4
    big = size * ss
    img = Image.new("RGBA", (big, big))
    px = img.load()
    for y in range(big):
        c = lerp(TOP, BOT, y / big)
        for x in range(big):
            px[x, y] = c + (255,)

    # subtiele diagonale textuur, zoals de hero-kaart
    tex = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    td = ImageDraw.Draw(tex)
    step = max(6, int(big * 0.035))
    for i in range(-big, big * 2, step):
        td.line([(i, 0), (i + big, big)], fill=(255, 255, 255, 12), width=max(1, big // 400))
    img.alpha_composite(tex)

    cx = cy = big // 2
    r = int(big * coin_ratio / 2)
    img.alpha_composite(coin(big, cx, cy, r))

    # € in de munt
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype(FONT, int(r * 1.15))
    except OSError:
        font = ImageFont.load_default()
    bbox = d.textbbox((0, 0), "€", font=font)
    d.text((cx - (bbox[2] - bbox[0]) / 2 - bbox[0], cy - (bbox[3] - bbox[1]) / 2 - bbox[1]),
           "€", font=font, fill=INK + (255,))

    img = img.resize((size, size), Image.LANCZOS)
    img.putalpha(rounded_mask(size, max(1, int(size * radius_ratio))))
    return img


targets = {
    "icon-192.png": make_icon(192, 0.22),
    "icon-512.png": make_icon(512, 0.22),
    "apple-touch-icon.png": make_icon(180, 0.001),   # iOS maskeert zelf
    "maskable-512.png": make_icon(512, 0.001, coin_ratio=0.46),
}
for name, im in targets.items():
    im.save(os.path.join(OUT, name))
    print("wrote", name, im.size)

make_icon(64, 0.22).save(os.path.join(OUT, "..", "favicon.png"))
print("wrote favicon.png")
