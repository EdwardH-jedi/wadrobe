"""Shared fixtures: isolated data dir, API client, generated test images."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from app.main import app


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    """Keep every test's job output inside a temp directory."""
    monkeypatch.setenv("AVATARWARDROBE_PROXY3D_DATA", str(tmp_path / "proxy_3d"))


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _png_bytes(img: Image.Image) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def make_transparent_garment_png(width: int = 120, height: int = 160) -> bytes:
    """A t-shirt-ish opaque shape on a transparent background."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Torso block plus two sleeve stubs.
    draw.rectangle(
        [width * 0.30, height * 0.20, width * 0.70, height * 0.85],
        fill=(180, 40, 40, 255),
    )
    draw.rectangle(
        [width * 0.12, height * 0.22, width * 0.30, height * 0.45],
        fill=(180, 40, 40, 255),
    )
    draw.rectangle(
        [width * 0.70, height * 0.22, width * 0.88, height * 0.45],
        fill=(180, 40, 40, 255),
    )
    return _png_bytes(img)


def make_transparent_back_png(width: int = 100, height: int = 140) -> bytes:
    """A distinct back-side shape (blue block with a notch), transparent bg."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle(
        [width * 0.25, height * 0.15, width * 0.75, height * 0.90],
        fill=(40, 60, 180, 255),
    )
    draw.rectangle(
        [width * 0.42, height * 0.15, width * 0.58, height * 0.35],
        fill=(0, 0, 0, 0),
    )
    return _png_bytes(img)


def make_opaque_png(width: int = 100, height: int = 80) -> bytes:
    """An RGB PNG with no alpha channel (red top half, blue bottom half)."""
    img = Image.new("RGB", (width, height), (200, 30, 30))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, height // 2, width, height], fill=(30, 30, 200))
    return _png_bytes(img)


def make_fully_transparent_png(width: int = 64, height: int = 64) -> bytes:
    return _png_bytes(Image.new("RGBA", (width, height), (0, 0, 0, 0)))


def make_oversized_png() -> bytes:
    """Tiny in bytes but over the pixel-dimension limit (1 x 4200)."""
    return _png_bytes(Image.new("L", (4200, 1), 128))


def make_jpeg_bytes(width: int = 64, height: int = 64) -> bytes:
    img = Image.new("RGB", (width, height), (120, 120, 120))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


def make_corrupt_png_bytes() -> bytes:
    """Valid PNG magic followed by garbage — must fail cleanly, not crash."""
    return b"\x89PNG\r\n\x1a\n" + b"this is not a real png body" * 10
