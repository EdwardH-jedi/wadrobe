"""API tests for the proxy-3D spike endpoints."""

from __future__ import annotations

import io
import struct

import trimesh

from app import config
from tests.conftest import (
    make_corrupt_png_bytes,
    make_fully_transparent_png,
    make_jpeg_bytes,
    make_opaque_png,
    make_oversized_png,
    make_transparent_garment_png,
)


def _post_png(client, data: bytes, name: str = "garment.png"):
    return client.post(
        "/api/proxy-3d", files={"file": (name, data, "image/png")}
    )


def test_accepts_transparent_png(client):
    response = _post_png(client, make_transparent_garment_png(120, 160))
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "done"
    assert body["method"] == "extruded-alpha-contour"
    assert body["alpha_mask_used"] is True
    assert body["input"] == {"width": 120, "height": 160, "has_alpha": True}
    assert body["mesh"]["vertices"] > 0
    assert body["mesh"]["faces"] > 0
    assert body["result_url"].endswith("/result.glb")


def test_status_endpoint_returns_persisted_record(client):
    created = _post_png(client, make_transparent_garment_png()).json()
    response = client.get(f"/api/proxy-3d/{created['job_id']}")
    assert response.status_code == 200
    assert response.json() == created


def test_result_endpoint_serves_valid_glb(client):
    created = _post_png(client, make_transparent_garment_png()).json()
    response = client.get(f"/api/proxy-3d/{created['job_id']}/result.glb")
    assert response.status_code == 200
    assert response.headers["content-type"] == "model/gltf-binary"

    glb = response.content
    assert len(glb) > 1000
    assert glb.startswith(b"glTF")
    version, length = struct.unpack_from("<II", glb, 4)
    assert version == 2
    assert length == len(glb)

    # A standard parser loads it and the geometry matches the metadata.
    scene = trimesh.load(io.BytesIO(glb), file_type="glb", process=False)
    geom = list(scene.geometry.values())
    assert len(geom) == 1
    assert len(geom[0].vertices) == created["mesh"]["vertices"]
    assert len(geom[0].faces) == created["mesh"]["faces"]


def test_opaque_png_uses_textured_plane(client):
    response = _post_png(client, make_opaque_png())
    assert response.status_code == 201
    body = response.json()
    assert body["method"] == "textured-plane"
    assert body["alpha_mask_used"] is False
    assert body["input"]["has_alpha"] is False
    assert body["mesh"] == {"vertices": 4, "faces": 2}


def test_metadata_contains_honest_limitations(client):
    body = _post_png(client, make_transparent_garment_png()).json()
    text = body["limitations"].lower()
    assert "proxy 3d preview" in text
    assert "not real virtual try-on" in text
    # The record never claims forbidden capabilities.
    for banned in ("real try-on", "accurate fit", "true to size"):
        assert banned not in text.replace("not real virtual try-on", "")


def test_rejects_non_png(client):
    response = _post_png(client, make_jpeg_bytes(), name="photo.jpg")
    assert response.status_code == 415
    assert "PNG" in response.json()["detail"]


def test_rejects_over_byte_limit(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 100)
    response = _post_png(client, make_transparent_garment_png())
    assert response.status_code == 413
    assert "too large" in response.json()["detail"].lower()


def test_rejects_over_dimension_limit(client):
    response = _post_png(client, make_oversized_png())
    assert response.status_code == 422
    assert "exceed" in response.json()["detail"]


def test_rejects_fully_transparent_png(client):
    response = _post_png(client, make_fully_transparent_png())
    assert response.status_code == 422
    assert "transparent" in response.json()["detail"].lower()


def test_corrupt_png_fails_cleanly_and_server_survives(client):
    response = _post_png(client, make_corrupt_png_bytes())
    assert response.status_code == 422
    assert "corrupt" in response.json()["detail"].lower()
    # The server keeps working after the failure.
    follow_up = _post_png(client, make_transparent_garment_png())
    assert follow_up.status_code == 201


def test_unknown_job_id_is_404(client):
    assert client.get("/api/proxy-3d/deadbeef" + "0" * 24).status_code == 404
    assert client.get("/api/proxy-3d/not-a-job-id").status_code == 404
    assert client.get("/api/proxy-3d/not-a-job-id/result.glb").status_code == 404
