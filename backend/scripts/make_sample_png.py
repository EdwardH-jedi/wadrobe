"""Generate a sample transparent garment PNG (a simple t-shirt silhouette).

Usage: python scripts/make_sample_png.py [output_path]
Default output: backend/data/samples/sample-garment.png
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    if len(sys.argv) > 1:
        out_path = Path(sys.argv[1])
    else:
        out_path = (
            Path(__file__).resolve().parents[1]
            / "data"
            / "samples"
            / "sample-garment.png"
        )

    w, h = 240, 320
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    body = (40, 60, 120, 255)
    draw.rectangle([w * 0.30, h * 0.18, w * 0.70, h * 0.88], fill=body)
    draw.rectangle([w * 0.10, h * 0.20, w * 0.30, h * 0.48], fill=body)
    draw.rectangle([w * 0.70, h * 0.20, w * 0.90, h * 0.48], fill=body)
    # Punch out a neckline.
    draw.ellipse([w * 0.40, h * 0.12, w * 0.60, h * 0.24], fill=(0, 0, 0, 0))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
