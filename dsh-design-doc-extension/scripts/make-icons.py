"""Draws the extension icons: a rounded dark tile with a `#` — the docs' own
anchor mark, and the thing this tool hands you (a key you can paste).

Usage:
    python scripts/make-icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
MEDIA = HERE.parent / "media"
SIZES = (128, 48, 32, 16)

SCALE = 4  # draw big, downsample once, so the 16px version stays crisp

BG = (15, 23, 42, 255)          # #0f172a
RING = (147, 197, 253, 90)      # #93c5fd at ~35%
MARK = (147, 197, 253, 255)     # #93c5fd


def draw_tile(size: int) -> Image.Image:
    canvas = size * SCALE
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    pad = round(canvas * 0.03)
    radius = round(canvas * 0.22)
    draw.rounded_rectangle((pad, pad, canvas - pad, canvas - pad), radius=radius, fill=BG)
    draw.rounded_rectangle(
        (pad, pad, canvas - pad, canvas - pad),
        radius=radius,
        outline=RING,
        width=max(2, round(canvas * 0.012)),
    )

    # Two vertical strokes, two horizontal: a hash, centred.
    stroke = max(3, round(canvas * 0.068))
    left, right = round(canvas * 0.345), round(canvas * 0.655)
    top, bottom = round(canvas * 0.30), round(canvas * 0.70)
    draw.line((left, top, left, bottom), fill=MARK, width=stroke)
    draw.line((right, top, right, bottom), fill=MARK, width=stroke)
    upper, lower = round(canvas * 0.42), round(canvas * 0.58)
    draw.line((round(canvas * 0.255), upper, round(canvas * 0.745), upper), fill=MARK, width=stroke)
    draw.line((round(canvas * 0.255), lower, round(canvas * 0.745), lower), fill=MARK, width=stroke)

    return image.resize((size, size), Image.LANCZOS)


def main() -> None:
    MEDIA.mkdir(parents=True, exist_ok=True)
    tiles = {size: draw_tile(size) for size in SIZES}
    for size, image in tiles.items():
        target = MEDIA / f"icon{size}.png"
        image.save(target)
        print(f"wrote {target} ({image.width}x{image.height})")

    # The README/preview uses the largest one; Windows Explorer wants an .ico.
    ico_sizes = [(128, 128), (48, 48), (32, 32), (16, 16)]
    tiles[128].save(MEDIA / "icon.ico", sizes=ico_sizes)
    print(f"wrote {MEDIA / 'icon.ico'}")


if __name__ == "__main__":
    main()
