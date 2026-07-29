#!/usr/bin/env python3
"""Genereer PWA-iconen: dennengroen squircle, witte € met subtiele groei-lijn."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# Gradient (donker dennengroen -> smaragd)
TOP = (21, 60, 48)     # #153C30
BOT = (46, 125, 91)    # #2E7D5B
MINT = (150, 220, 186) # groei-lijn


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * ss - 1, size * ss - 1], radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def draw_trend(dr, big):
    """Subtiele stijgende lijn met pijlpunt, achter de glyph."""
    pts = [(0.13, 0.66), (0.33, 0.55), (0.5, 0.61), (0.7, 0.40), (0.85, 0.27)]
    P = [(x * big, y * big) for x, y in pts]
    col = MINT + (70,)
    dr.line(P, fill=col, width=int(big * 0.028), joint="curve")
    # pijlpunt
    ex, ey = P[-1]
    dx, dy = ex - P[-2][0], ey - P[-2][1]
    ln = (dx * dx + dy * dy) ** 0.5 or 1
    ux, uy = dx / ln, dy / ln
    s = big * 0.075
    left = (ex - ux * s - uy * s * 0.6, ey - uy * s + ux * s * 0.6)
    right = (ex - ux * s + uy * s * 0.6, ey - uy * s - ux * s * 0.6)
    dr.polygon([(ex, ey), left, right], fill=MINT + (95,))


def make_icon(size, radius_ratio, pad_ratio=0.0, glyph_ratio=0.52):
    ss = 4
    big = size * ss
    grad = Image.new("RGBA", (big, big))
    px = grad.load()
    for y in range(big):
        c = lerp(TOP, BOT, y / big)
        for x in range(big):
            px[x, y] = c + (255,)

    # glass-highlight
    hi = Image.new("L", (big, big), 0)
    hd = ImageDraw.Draw(hi)
    hd.ellipse([-big * 0.3, -big * 0.5, big * 0.9, big * 0.5], fill=80)
    hi = hi.filter(ImageFilter.GaussianBlur(big * 0.06))
    white = Image.new("RGBA", (big, big), (255, 255, 255, 255))
    grad = Image.composite(white, grad, hi.point(lambda v: int(v * 0.4)))

    dr = ImageDraw.Draw(grad)
    draw_trend(dr, big)

    try:
        font = ImageFont.truetype(FONT, int(big * glyph_ratio))
    except OSError:
        font = ImageFont.load_default()
    bbox = dr.textbbox((0, 0), "€", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (big - tw) / 2 - bbox[0]
    ty = (big - th) / 2 - bbox[1]
    dr.text((tx, ty + big * 0.02), "€", font=font, fill=(255, 255, 255, 240))

    grad = grad.resize((size, size), Image.LANCZOS)

    if pad_ratio > 0:
        inner = int(size * (1 - pad_ratio * 2))
        tile = grad.resize((inner, inner), Image.LANCZOS)
        tile.putalpha(rounded_mask(inner, int(inner * radius_ratio)))
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        off = (size - inner) // 2
        canvas.alpha_composite(tile, (off, off))
        return canvas
    grad.putalpha(rounded_mask(size, int(size * radius_ratio)))
    return grad


def make_maskable(size):
    icon = make_icon(size, radius_ratio=0.001, glyph_ratio=0.4)
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bg.alpha_composite(icon)
    return bg


targets = {
    "icon-192.png": make_icon(192, 0.22),
    "icon-512.png": make_icon(512, 0.22),
    "apple-touch-icon.png": make_icon(180, 0.0, glyph_ratio=0.52),
    "maskable-512.png": make_maskable(512),
}
for name, im in targets.items():
    im.save(os.path.join(OUT, name))
    print("wrote", name, im.size)

make_icon(64, 0.22).save(os.path.join(OUT, "..", "favicon.png"))
print("wrote favicon.png")
