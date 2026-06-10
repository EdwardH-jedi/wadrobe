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
    make_transparent_back_png,
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


class TestDualSided:
    def test_dual_generation_with_mismatched_sizes(self):
        # Front 240x320, back 100x140 — bounding-box alignment must cope.
        result = pipeline.generate(
            make_transparent_garment_png(240, 320),
            make_transparent_back_png(100, 140),
        )
        assert result.sides == "dual"
        assert result.method == pipeline.METHOD_EXTRUDED_DUAL
        assert result.back_alpha_mask_used is True
        assert result.back_width == 100 and result.back_height == 140
        assert result.vertex_count > 0 and result.face_count > 0
        assert "bounding box" in result.limitations

        # Three submeshes, two of them textured.
        scene = trimesh.load(
            io.BytesIO(result.glb_bytes), file_type="glb", process=False
        )
        assert len(scene.geometry) == 3
        z_min = min(g.vertices[:, 2].min() for g in scene.geometry.values())
        z_max = max(g.vertices[:, 2].max() for g in scene.geometry.values())
        assert (z_max - z_min) == pytest.approx(config.EXTRUDE_DEPTH_RATIO)

    def test_dual_parts_carry_distinct_textures(self):
        from PIL import Image

        result = pipeline.generate(
            make_transparent_garment_png(120, 160),
            make_transparent_back_png(100, 140),
        )
        import pygltflib

        parsed = pygltflib.GLTF2.load_from_bytes(result.glb_bytes)
        assert len(parsed.images) == 2  # two distinct embedded textures
        assert len(parsed.materials) == 3
        # Exactly one untextured (wall) material.
        untextured = [
            m
            for m in parsed.materials
            if m.pbrMetallicRoughness.baseColorTexture is None
        ]
        assert len(untextured) == 1

    def test_fully_transparent_back_is_a_clean_422(self):
        from tests.conftest import make_fully_transparent_png

        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(
                make_transparent_garment_png(),
                make_fully_transparent_png(),
            )
        assert err.value.status_code == 422
        assert err.value.detail.startswith("Back image:")

    def test_non_png_back_is_rejected_naming_the_side(self):
        with pytest.raises(pipeline.Proxy3dError) as err:
            pipeline.generate(make_transparent_garment_png(), make_jpeg_bytes())
        assert err.value.status_code == 415
        assert err.value.detail.startswith("Back image:")


class TestManualAlignment:
    def test_clamp_back_alignment_bounds(self):
        assert pipeline.clamp_back_alignment(99, -7, 7) == (4.0, -0.5, 0.5)
        assert pipeline.clamp_back_alignment(0.01, 0.0, 0.0) == (0.25, 0.0, 0.0)
        assert pipeline.clamp_back_alignment(1.0, 0.2, -0.1) == (1.0, 0.2, -0.1)
        assert pipeline.clamp_back_alignment(
            float("nan"), float("inf"), 0.0
        ) == (1.0, 0.0, 0.0)

    def test_offsets_shift_the_pasted_back_content(self):
        import numpy as np
        from PIL import Image

        front_texture = Image.new("RGBA", (200, 300), (0, 0, 0, 0))
        front_mask = np.zeros((300, 200), dtype=bool)
        front_mask[60:240, 50:150] = True  # bbox center (100, 150)

        back = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        back.paste(Image.new("RGBA", (40, 40), (255, 0, 0, 255)), (20, 20))
        back_mask = np.asarray(back.getchannel("A")) >= 128

        # scale_mult 0.5 keeps the pasted content well inside the canvas so
        # edge clipping cannot skew the measured center.
        aligned = pipeline.build_aligned_back_texture(
            front_texture,
            front_mask,
            (200, 300),
            back,
            back_mask,
            scale_mult=0.5,
            offset_x_frac=0.1,  # +20px of the 200px canvas
            offset_y_frac=-0.1,  # -30px of the 300px canvas
        )
        a = np.asarray(aligned.getchannel("A")) >= 128
        left, top, right, bottom = pipeline._mask_bbox(a)
        assert (left + right) / 2 == pytest.approx(100 + 20, abs=3)
        assert (top + bottom) / 2 == pytest.approx(150 - 30, abs=3)

    def test_scale_mult_grows_the_pasted_back_content(self):
        import numpy as np
        from PIL import Image

        front_texture = Image.new("RGBA", (200, 300), (0, 0, 0, 0))
        front_mask = np.zeros((300, 200), dtype=bool)
        front_mask[60:240, 50:150] = True  # bbox height 180

        back = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        back.paste(Image.new("RGBA", (40, 40), (255, 0, 0, 255)), (20, 20))
        back_mask = np.asarray(back.getchannel("A")) >= 128

        aligned = pipeline.build_aligned_back_texture(
            front_texture,
            front_mask,
            (200, 300),
            back,
            back_mask,
            scale_mult=0.5,
        )
        a = np.asarray(aligned.getchannel("A")) >= 128
        left, top, right, bottom = pipeline._mask_bbox(a)
        assert (bottom - top) == pytest.approx(90, abs=3)  # half of 180

    def test_generate_dual_with_manual_alignment_flags_manual(self):
        result = pipeline.generate(
            make_transparent_garment_png(),
            make_transparent_back_png(),
            back_scale=1.5,
            back_offset_x=0.2,
        )
        assert result.back_align_manual is True
        assert result.back_align_scale == 1.5
        assert "manually adjusted" in result.limitations
        assert result.glb_bytes.startswith(b"glTF")


class TestBackAlignment:
    def test_aligned_back_texture_matches_front_canvas_and_centers_content(self):
        import numpy as np
        from PIL import Image

        front_texture = Image.new("RGBA", (200, 300), (0, 0, 0, 0))
        # Front silhouette bbox: rows 60..240, cols 50..150 (in mask coords ==
        # original coords here since front_size == texture size).
        front_mask = np.zeros((300, 200), dtype=bool)
        front_mask[60:240, 50:150] = True

        back = Image.new("RGBA", (80, 80), (0, 0, 0, 0))
        back.paste(Image.new("RGBA", (40, 40), (255, 0, 0, 255)), (20, 20))
        back_mask = np.asarray(back.getchannel("A")) >= 128

        aligned = pipeline.build_aligned_back_texture(
            front_texture, front_mask, (200, 300), back, back_mask
        )
        assert aligned.size == front_texture.size
        a = np.asarray(aligned.getchannel("A")) >= 128
        bbox = pipeline._mask_bbox(a)
        assert bbox is not None
        left, top, right, bottom = bbox
        # Scaled to the front bbox height (180px) and centered on its center
        # (100, 150).
        assert (bottom - top) == pytest.approx(180, abs=3)
        assert (left + right) / 2 == pytest.approx(100, abs=3)
        assert (top + bottom) / 2 == pytest.approx(150, abs=3)
