"""Unit tests for the PNG -> proxy-3D pipeline and mesh builders."""

from __future__ import annotations

import io
import struct

import numpy as np
import pygltflib
import pytest
import trimesh

from app import config
from app.proxy3d import meshbuild, pipeline
from tests.conftest import (
    make_corrupt_png_bytes,
    make_jpeg_bytes,
    make_opaque_png,
    make_transparent_garment_png,
)


class TestValidation:
    def test_rejects_empty_upload(self):
        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(b"")
        assert err.value.status_code == 422

    def test_rejects_non_png(self):
        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(make_jpeg_bytes())
        assert err.value.status_code == 415
        assert "PNG" in err.value.detail

    def test_rejects_corrupt_png(self):
        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(make_corrupt_png_bytes())
        assert err.value.status_code == 422

    def test_rejects_over_byte_limit(self, monkeypatch):
        monkeypatch.setattr(config, "MAX_UPLOAD_BYTES", 100)
        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(make_transparent_garment_png())
        assert err.value.status_code == 413


class TestMeshBuilders:
    def test_plane_is_a_single_quad(self):
        mesh = meshbuild.build_plane(100, 50)
        assert len(mesh.vertices) == 4
        assert len(mesh.faces) == 2
        # Longer edge normalized to 1.0.
        extent = mesh.vertices.max(axis=0) - mesh.vertices.min(axis=0)
        assert extent[0] == pytest.approx(1.0)
        assert extent[1] == pytest.approx(0.5)

    def test_extruded_mesh_from_simple_grid(self):
        grid = np.zeros((4, 4), dtype=bool)
        grid[1:3, 1:3] = True  # a 2x2 solid block
        mesh = meshbuild.build_extruded_mesh(grid, 80, 80)
        assert len(mesh.vertices) > 0
        assert len(mesh.faces) > 0
        # All face indices valid.
        assert mesh.faces.min() >= 0
        assert mesh.faces.max() < len(mesh.vertices)
        # Slab thickness matches the configured extrusion depth.
        z_extent = mesh.vertices[:, 2].max() - mesh.vertices[:, 2].min()
        assert z_extent == pytest.approx(config.EXTRUDE_DEPTH_RATIO)
        # The slab of a filled block is watertight (front + back + walls).
        tri = trimesh.Trimesh(mesh.vertices, mesh.faces, process=True)
        assert tri.is_watertight
        assert tri.is_winding_consistent

    def test_extruded_mesh_rejects_empty_grid(self):
        with pytest.raises(ValueError):
            meshbuild.build_extruded_mesh(np.zeros((3, 3), dtype=bool), 10, 10)


class TestGeneration:
    def test_transparent_png_gives_extruded_contour(self):
        result = pipeline.generate(make_transparent_garment_png())
        assert result.method == pipeline.METHOD_EXTRUDED
        assert result.alpha_mask_used is True
        assert result.input_has_alpha is True
        assert result.vertex_count > 4
        assert result.face_count > 2

    def test_opaque_png_falls_back_to_plane(self):
        result = pipeline.generate(make_opaque_png())
        assert result.method == pipeline.METHOD_PLANE
        assert result.alpha_mask_used is False
        assert result.input_has_alpha is False
        assert result.vertex_count == 4
        assert result.face_count == 2

    def test_glb_parses_with_standard_parsers(self):
        result = pipeline.generate(make_transparent_garment_png())
        glb = result.glb_bytes

        # GLB container header: magic, version 2, declared length.
        assert glb.startswith(b"glTF")
        version, length = struct.unpack_from("<II", glb, 4)
        assert version == 2
        assert length == len(glb)

        # pygltflib parses it.
        parsed = pygltflib.GLTF2.load_from_bytes(glb)
        assert len(parsed.meshes) == 1
        assert parsed.textures, "expected an embedded texture"

        # trimesh round-trips it with matching geometry.
        scene = trimesh.load(io.BytesIO(glb), file_type="glb", process=False)
        geom = list(scene.geometry.values())
        assert len(geom) == 1
        assert len(geom[0].vertices) == result.vertex_count
        assert len(geom[0].faces) == result.face_count

    def test_limitations_text_is_honest(self):
        result = pipeline.generate(make_transparent_garment_png())
        text = result.limitations.lower()
        assert "proxy 3d preview" in text
        assert "not real virtual try-on" in text
        assert "not accurate garment geometry" in text
