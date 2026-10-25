"""Generate deterministic MP4 fixtures for the parser and browser tests.

Each frame carries its index in seven large binary blocks. The blocks survive
H.264 encoding, so a browser test can decode the displayed frame number from a
canvas and prove that a one-frame step landed on the exact frame it claimed.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

WIDTH = 320
HEIGHT = 180
BLOCK = 26
GAP = 10
BLOCK_Y = 77
BITS = 7
FIRST_X = (WIDTH - (BITS * BLOCK + (BITS - 1) * GAP)) // 2

ON = (242, 246, 255)
OFF = (46, 52, 72)
BACKGROUND = (17, 21, 36)


def make_frames(directory: str, count: int) -> None:
    shutil.rmtree(directory, ignore_errors=True)
    os.makedirs(directory, exist_ok=True)
    for index in range(count):
        image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
        draw = ImageDraw.Draw(image)
        for bit in range(BITS):
            x = FIRST_X + bit * (BLOCK + GAP)
            color = ON if (index >> bit) & 1 else OFF
            draw.rectangle([x, BLOCK_Y, x + BLOCK - 1, BLOCK_Y + BLOCK - 1], fill=color)
        # A thin frame border keeps the stage visibly bounded on black.
        draw.rectangle([0, 0, WIDTH - 1, HEIGHT - 1], outline=(90, 100, 130), width=2)
        image.save(os.path.join(directory, f"frame{index:04d}.png"))


def encode(
    ffmpeg: str,
    frames_dir: str,
    output: str,
    fps: int,
    count: int,
    bframes: int,
    gop: int,
    audio: bool,
    fragmented: bool,
) -> None:
    duration = count / fps
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-framerate",
        str(fps),
        "-i",
        os.path.join(frames_dir, "frame%04d.png"),
    ]
    if audio:
        command += [
            "-f",
            "lavfi",
            "-i",
            f"sine=frequency=440:sample_rate=48000:duration={duration:.6f}",
        ]
    command += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-g",
        str(gop),
        "-keyint_min",
        str(gop),
        "-bf",
        str(bframes),
        "-sc_threshold",
        "0",
    ]
    if audio:
        command += ["-c:a", "aac", "-b:a", "96k", "-shortest"]
    if fragmented:
        command += ["-movflags", "frag_keyframe+empty_moov"]
    else:
        command += ["-movflags", "+faststart"]
    command += [output]
    subprocess.run(command, check=True)


def encode_demo(ffmpeg: str, output: str) -> None:
    """A colourful clip for the README screenshot (1-based frame labels)."""
    source = (
        "gradients=s=1280x720:r=25:d=8:"
        "c0=0x0b1020:c1=0x4f8cff:c2=0x8b5cf6:c3=0xfb7299:"
        "nb_colors=4:speed=0.012:type=spiral:seed=42"
    )
    bold = "C:/Windows/Fonts/arialbd.ttf"
    regular = "C:/Windows/Fonts/arial.ttf"
    if os.path.exists(bold) and os.path.exists(regular):
        bold = bold.replace(":", "\\:")
        regular = regular.replace(":", "\\:")
        video_filter = (
            f"drawtext=fontfile='{bold}':text='FRAME %{{eif\\:n+1\\:d}}':"
            "fontcolor=white@0.94:fontsize=76:x=(w-text_w)/2:y=h-170:"
            "shadowcolor=black@0.45:shadowx=2:shadowy=2,"
            f"drawtext=fontfile='{regular}':"
            "text='25 FPS  ·  FRAME-ACCURATE PLAYER':fontcolor=white@0.62:"
            "fontsize=26:x=(w-text_w)/2:y=h-80"
        )
    else:
        video_filter = "null"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            source,
            "-vf",
            video_filter,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output,
        ],
        check=True,
    )


def main() -> int:
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_dir = os.path.join(root, "fixtures")
    work = os.path.join(output_dir, ".frames")
    os.makedirs(output_dir, exist_ok=True)
    shutil.rmtree(work, ignore_errors=True)

    plans = [
        # name, frames, fps, bframes, gop, audio, fragmented
        ("frames-25fps.mp4", 120, 25, 3, 50, True, False),
        ("frames-30fps.mp4", 90, 30, 0, 30, True, False),
        ("frames-25fps-long-gop.mp4", 120, 25, 2, 120, True, False),
        ("frames-25fps-fragmented.mp4", 60, 25, 0, 25, False, True),
    ]
    for name, count, fps, bframes, gop, audio, fragmented in plans:
        make_frames(work, count)
        print(f"encoding {name} ({count} frames @ {fps} fps)")
        encode(
            ffmpeg,
            work,
            os.path.join(output_dir, name),
            fps,
            count,
            bframes,
            gop,
            audio,
            fragmented,
        )

    shutil.rmtree(work, ignore_errors=True)
    print("encoding demo.mp4 (README still)")
    encode_demo(ffmpeg, os.path.join(output_dir, "demo.mp4"))
    print(f"fixtures written to {output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
