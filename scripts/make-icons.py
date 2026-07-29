#!/usr/bin/env python3
"""Genereer PWA-iconen in Apple glass-stijl (blauw/paars gradient met € glyph)."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Gradient endpoints (indigo -> teal), Apple-achtig
TOP = (99, 102, 241)      # indigo-500
BOT = (14, 165, 233)      # sky-500


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1],
                        radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def make_icon(size, radius_ratio, pad_ratio=0.0, glyph_ratio=0.56):
    ss = 4
    big = size * ss
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))

    # Vertical gradient tile
    grad = Image.new("RGBA", (big, big))
    px = grad.load()
    for y in range(big):
        c = lerp(TOP, BOT, y / big)
        for x in range(big):
            px[x, y] = c + (255,)

    # Soft diagonal glass highlight
    hi = Image.new("L", (big, big), 0)
    hd = ImageDraw.Draw(hi)
    hd.ellipse([-big * 0.3, -big * 0.5, big * 0.9, big * 0.55], fill=90)
    hi = hi.filter(ImageFilter.GaussianBlur(big * 0.06))
    white = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    grad = Image.composite(white, grad, hi.point(lambda v: int(v * 0.5)))

    # Euro glyph
    dr = ImageDraw.Draw(grad)
    try:
        font = ImageFont.truetype(FONT, int(big * glyph_ratio))
    except OSError:
        font = ImageFont.load_default()
    bbox = dr.textbbox((0, 0), "€", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (big - tw) / 2 - bbox[0]
    ty = (big - th) / 2 - bbox[1]
    dr.text((tx, ty + big * 0.02), "€", font=font, fill=(255, 255, 255, 235))

    grad = grad.resize((size, size), Image.LANCZOS)

    # Rounded corners + optional padding (voor maskable safe-zone)
    if pad_ratio > 0:
        inner = int(size * (1 - pad_ratio * 2))
        tile = grad.resize((inner, inner), Image.LANCZOS)
        mask = rounded_mask(inner, int(inner * radius_ratio))
        tile.putalpha(mask)
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        off = (size - inner) // 2
        canvas.alpha_composite(tile, (off, off))
        return canvas
    else:
        mask = rounded_mask(size, int(size * radius_ratio))
        grad.putalpha(mask)
        return grad


def make_maskable(size):
    # Volledige achtergrond gevuld (geen transparantie), glyph binnen safe zone
    icon = make_icon(size, radius_ratio=0.001, pad_ratio=0.0, glyph_ratio=0.42)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.alpha_composite(icon)
    return bg


targets = {
    "icon-192.png": make_icon(192, 0.22),
    "icon-512.png": make_icon(512, 0.22),
    "apple-touch-icon.png": make_icon(180, 0.0, glyph_ratio=0.56),  # iOS rondt zelf af
    "maskable-512.png": make_maskable(512),
}

for name, im in targets.items():
    im.save(os.path.join(OUT, name))
    print("wrote", name, im.size)

# Favicon
fav = make_icon(64, 0.22)
fav.save(os.path.join(OUT, "..", "favicon.png"))
print("wrote favicon.png")
