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
    make_transparent_back_png,
    make_transparent_garment_png,
)


def _post_png(
    client,
    data: bytes,
    name: str = "garment.png",
    back: bytes | None = None,
    form: dict | None = None,
):
    files = {"file": (name, data, "image/png")}
    if back is not None:
        files["back_file"] = ("back.png", back, "image/png")
    return client.post("/api/proxy-3d", files=files, data=form)


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


def test_single_sided_record_reports_single(client):
    body = _post_png(client, make_transparent_garment_png()).json()
    assert body["sides"] == "single"
    assert body["back_input"] is None
    assert body["back_alpha_mask_used"] is None


def test_dual_sided_request_generates_dual_glb(client):
    response = _post_png(
        client,
        make_transparent_garment_png(120, 160),
        back=make_transparent_back_png(100, 140),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["sides"] == "dual"
    assert body["method"] == "extruded-alpha-contour-dual"
    assert body["alpha_mask_used"] is True
    assert body["back_alpha_mask_used"] is True
    assert body["back_input"] == {"width": 100, "height": 140, "has_alpha": True}
    assert body["mesh"]["vertices"] > 0
    assert body["mesh"]["faces"] > 0
    assert "bounding box" in body["limitations"]

    # The GLB is real, non-empty, and carries TWO textures + a wall material.
    import io
    import pygltflib
    import trimesh

    glb = client.get(f"/api/proxy-3d/{body['job_id']}/result.glb").content
    assert glb.startswith(b"glTF") and len(glb) > 1000
    parsed = pygltflib.GLTF2.load_from_bytes(glb)
    assert len(parsed.textures) == 2
    assert len(parsed.materials) == 3
    scene = trimesh.load(io.BytesIO(glb), file_type="glb", process=False)
    geoms = list(scene.geometry.values())
    assert len(geoms) == 3
    assert sum(len(g.vertices) for g in geoms) == body["mesh"]["vertices"]
    assert sum(len(g.faces) for g in geoms) == body["mesh"]["faces"]


def test_dual_with_opaque_back_reports_no_back_mask(client):
    body = _post_png(
        client,
        make_transparent_garment_png(),
        back=make_opaque_png(),
    ).json()
    assert body["sides"] == "dual"
    assert body["back_alpha_mask_used"] is False
    assert body["back_input"]["has_alpha"] is False


def test_corrupt_back_image_fails_cleanly_naming_the_side(client):
    response = _post_png(
        client,
        make_transparent_garment_png(),
        back=make_corrupt_png_bytes(),
    )
    assert response.status_code == 422
    assert response.json()["detail"].startswith("Back image:")


def test_opaque_front_with_back_falls_back_to_single_flat_card(client):
    body = _post_png(
        client,
        make_opaque_png(),
        back=make_transparent_back_png(),
    ).json()
    assert body["method"] == "textured-plane"
    assert body["sides"] == "single"
    assert body["back_input"] is None


def test_dual_without_alignment_fields_reports_defaults_not_manual(client):
    body = _post_png(
        client,
        make_transparent_garment_png(),
        back=make_transparent_back_png(),
    ).json()
    assert body["back_alignment"] == {
        "scale": 1.0,
        "offset_x": 0.0,
        "offset_y": 0.0,
        "manual": False,
    }
    assert "bounding box" in body["limitations"]


def test_dual_with_manual_alignment_reports_applied_values(client):
    response = _post_png(
        client,
        make_transparent_garment_png(),
        back=make_transparent_back_png(),
        form={"back_scale": "1.5", "back_offset_x": "0.2", "back_offset_y": "-0.1"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["back_alignment"] == {
        "scale": 1.5,
        "offset_x": 0.2,
        "offset_y": -0.1,
        "manual": True,
    }
    assert "manually adjusted" in body["limitations"]
    assert "not a fit estimate" in body["limitations"]
    # The GLB stays parser-valid.
    glb = client.get(f"/api/proxy-3d/{body['job_id']}/result.glb").content
    assert glb.startswith(b"glTF")


def test_alignment_values_are_clamped(client):
    body = _post_png(
        client,
        make_transparent_garment_png(),
        back=make_transparent_back_png(),
        form={"back_scale": "99", "back_offset_x": "-7", "back_offset_y": "7"},
    ).json()
    assert body["back_alignment"] == {
        "scale": 4.0,
        "offset_x": -0.5,
        "offset_y": 0.5,
        "manual": True,
    }


def test_alignment_fields_on_single_sided_are_ignored(client):
    body = _post_png(
        client,
        make_transparent_garment_png(),
        form={"back_scale": "2.0"},
    ).json()
    assert body["sides"] == "single"
    assert body["back_alignment"] is None


def test_unknown_job_id_is_404(client):
    assert client.get("/api/proxy-3d/deadbeef" + "0" * 24).status_code == 404
    assert client.get("/api/proxy-3d/not-a-job-id").status_code == 404
    assert client.get("/api/proxy-3d/not-a-job-id/result.glb").status_code == 404
