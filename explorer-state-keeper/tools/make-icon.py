"""Generate the Explorer State Keeper application icon.

Run from the project root:
    python tools/make-icon.py

The source artwork is rendered at 1024x1024 and downsampled into a
multi-resolution Windows .ico so the tray icon stays legible at 16x16.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SIZE = 1024
SS = 2  # extra supersampling before the final downsample


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def render():
    s = SIZE * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def X(v):
        return int(round(v * s / 1024.0))

    # Soft shadow beneath the folder.
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded(sd, (X(86), X(300), X(938), X(888)), X(92), fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(X(26)))
    img.alpha_composite(shadow)

    # Folder tab and back panel.
    rounded(d, (X(108), X(184), X(492), X(352)), X(54), fill=(177, 104, 0, 255))
    rounded(d, (X(108), X(250), X(916), X(838)), X(92), fill=(198, 121, 0, 255))

    # Folder front panel.
    front = (94, 278, 930, 888)
    rounded(d, (X(front[0]), X(front[1]), X(front[2]), X(front[3])), X(96),
            fill=(255, 191, 70, 255), outline=(122, 72, 0, 255), width=X(18))

    # Gentle top highlight on the folder.
    hi = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    rounded(hd, (X(128), X(308), X(896), X(430)), X(64), fill=(255, 255, 255, 52))
    hi = hi.filter(ImageFilter.GaussianBlur(X(18)))
    img.alpha_composite(hi)

    # Clock badge: white rim, blue face, white dial.
    cx, cy, r = X(704), X(690), X(232)
    shadow2 = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd2 = ImageDraw.Draw(shadow2)
    sd2.ellipse((cx - r, cy - r + X(18), cx + r, cy + r + X(18)), fill=(0, 0, 0, 95))
    shadow2 = shadow2.filter(ImageFilter.GaussianBlur(X(22)))
    img.alpha_composite(shadow2)

    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 255))
    d.ellipse((cx - r + X(20), cy - r + X(20), cx + r - X(20), cy + r - X(20)),
              fill=(20, 93, 173, 255))
    face_r = r - X(58)
    d.ellipse((cx - face_r, cy - face_r, cx + face_r, cy + face_r),
              fill=(245, 250, 255, 255))

    hand = X(24)
    # 10:10-ish hands, thick round caps.
    d.line((cx, cy, cx, cy - X(118)), fill=(20, 93, 173, 255), width=hand)
    d.line((cx, cy, cx + X(88), cy + X(38)), fill=(20, 93, 173, 255), width=hand)
    d.ellipse((cx - X(26), cy - X(26), cx + X(26), cy + X(26)), fill=(20, 93, 173, 255))
    d.ellipse((cx - X(10), cy - X(10), cx + X(10), cy + X(10)), fill=(255, 255, 255, 255))

    # Small green "saved" dot at the top-right of the badge.
    gx, gy, gr = X(880), X(512), X(74)
    d.ellipse((gx - gr, gy - gr, gx + gr, gy + gr), fill=(255, 255, 255, 255))
    d.ellipse((gx - gr + X(14), gy - gr + X(14), gx + gr - X(14), gy + gr - X(14)),
              fill=(32, 160, 92, 255))

    # Draw two folder seams for readability at large sizes.
    d.line((X(172), X(380), X(852), X(380)), fill=(218, 145, 18, 255), width=X(10))

    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    icon = render()
    icon.save(ASSETS / "app.ico", format="ICO",
              sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40),
                     (48, 48), (64, 64), (128, 128), (256, 256)])
    icon.save(ASSETS / "app-preview.png", format="PNG")
    print("wrote", ASSETS / "app.ico")
    print("wrote", ASSETS / "app-preview.png")


if __name__ == "__main__":
    main()
