#!/usr/bin/env python3
"""Generate the app icons used by index.html (pure stdlib, deterministic).

Run from the project root:  python3 scripts/gen-icons.py
Writes public/apple-touch-icon.png (180x180) and public/icons/icon-512.png.

The mark is the same 3x3 pitch grid as public/favicon.svg: lime cells on ink.
"""

import os
import struct
import zlib

INK = (13, 19, 28, 255)  # #0d131c
LIME = (201, 244, 91, 255)  # #c9f45b
DIM = (38, 49, 63, 255)  # #26313f


def chunk(tag: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def make_icon(size: int) -> bytes:
    radius = size * 0.22
    cell = size * 0.125
    gap = size * 0.0625
    origin = (size - (cell * 3 + gap * 2)) / 2

    filled = {(0, 0), (1, 1), (2, 1), (0, 2)}

    scanlines = bytearray()
    for y in range(size):
        scanlines.append(0)  # filter type 0
        for x in range(size):
            # rounded-corner mask (outside the squircle -> transparent)
            dx = max(radius - x, 0, x - (size - radius))
            dy = max(radius - y, 0, y - (size - radius))
            if dx * dx + dy * dy > radius * radius:
                scanlines += b"\x00\x00\x00\x00"
                continue

            px = INK
            for row in range(3):
                for col in range(3):
                    cx = origin + col * (cell + gap)
                    cy = origin + row * (cell + gap)
                    if cx <= x < cx + cell and cy <= y < cy + cell:
                        px = LIME if (row, col) in filled else DIM
            scanlines += bytes(px)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(scanlines), 9))
        + chunk(b"IEND", b"")
    )


def main() -> None:
    targets = [
        (os.path.join("public", "apple-touch-icon.png"), 180),
        (os.path.join("public", "icons", "icon-512.png"), 512),
    ]
    for path, size in targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(make_icon(size))
        print(f"wrote {path} ({size}x{size}, {os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
