"""API tests for the ML background-removal endpoint (Avatar Visual step 1b).

The happy path uses ``importorskip`` so this suite stays green on a backend that
has NOT installed the heavy ``rembg`` dependency (the endpoint 503s there and the
frontend falls back to its local heuristic). The validation paths run everywhere
because they reject BEFORE the lazy import.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from app import config
from tests.conftest import make_opaque_png


def _post(client, data: bytes, name: str = "garment.png"):
    return client.post("/api/cutout", files={"file": (name, data, "image/png")})


def test_cutout_rejects_empty_upload(client):
    assert _post(client, b"").status_code == 422


def test_cutout_rejects_oversized_upload(client, monkeypatch):
    # config attributes are read at call time, so monkeypatching the ceiling is
    # enough to exercise the 413 path without a real multi-MB payload.
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 64)
    assert _post(client, b"x" * 256).status_code == 413


def test_cutout_removes_background_and_returns_transparent_png(client):
    pytest.importorskip("rembg")
    response = _post(client, make_opaque_png(80, 64))
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    out = Image.open(io.BytesIO(response.content))
    # rembg returns an RGBA cutout (an alpha channel is what makes it a cutout).
    assert out.mode == "RGBA"
    assert out.size == (80, 64)
