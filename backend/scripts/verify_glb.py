"""Verify a GLB file with standard parsers (pygltflib + trimesh).

Usage: python scripts/verify_glb.py <path-to.glb>
Prints container header info, mesh/texture inventory, and geometry counts.
Exits non-zero if the file is not a valid GLB.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import pygltflib
import trimesh


def main() -> None:
    path = Path(sys.argv[1])
    data = path.read_bytes()

    magic = data[:4]
    version, length = struct.unpack_from("<II", data, 4)
    assert magic == b"glTF", f"bad magic: {magic!r}"
    assert version == 2, f"unexpected GLB version: {version}"
    assert length == len(data), f"declared {length} != actual {len(data)} bytes"
    print(f"GLB container ok: magic=glTF version={version} bytes={len(data)}")

    parsed = pygltflib.GLTF2.load_from_bytes(data)
    print(
        f"pygltflib ok: meshes={len(parsed.meshes)} "
        f"materials={len(parsed.materials)} textures={len(parsed.textures)} "
        f"images={len(parsed.images)}"
    )

    scene = trimesh.load(path, file_type="glb", process=False)
    for name, geom in scene.geometry.items():
        print(
            f"trimesh ok: geometry '{name}' vertices={len(geom.vertices)} "
            f"faces={len(geom.faces)} extents={geom.extents.round(4).tolist()}"
        )


if __name__ == "__main__":
    main()
