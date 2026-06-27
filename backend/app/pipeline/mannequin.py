"""Procedural mannequin builder (Track B, Phase B4b).

An honest avatar PROXY: a faceless, tall, smooth fashion-style mannequin
assembled from trimesh primitives (sphere head, cylinder neck, tapered torso,
two arms, two legs). It is NOT a real avatar, a body scan, or an accurate fit —
just a parametric stand-in whose bounding box tracks the requested proportions.

No ML, no reconstruction: only trimesh + numpy. The mannequin is built Y-up
(height along +Y, feet at y=0), the same axis convention as the B4a box, so it
renders upright in a standard glTF viewer. It implements the existing
``IAvatarBuilder`` Protocol, so the runner swaps it in without any other change.
"""

from __future__ import annotations

import numpy as np
import trimesh

from app.pipeline.interfaces import AvatarMesh, BodyProportions

# Vertical layout as fractions of total height (feet at 0.0, head top at 1.0).
_Y_HIP = 0.50
_Y_SHOULDER = 0.82
_Y_NECK_TOP = 0.86
_Y_ARM_BOTTOM = 0.46  # wrists hang to just below the hip line
_HEAD_RADIUS = 0.07
_NECK_RADIUS = 0.035
_LEG_RADIUS = 0.06
_ARM_RADIUS = 0.045
_LEG_INSET = 0.5  # leg x-offset as a fraction of the hip half-width
_SECTIONS = 24


def _tapered_torso(
    hip_radius: float,
    shoulder_radius: float,
    y_hip: float,
    y_shoulder: float,
) -> trimesh.Trimesh:
    """A frustum torso: a unit cylinder whose rings are scaled per-height so it
    is wide at the shoulders and narrow at the hips."""
    torso = trimesh.creation.cylinder(
        radius=1.0,
        segment=[[0.0, y_hip, 0.0], [0.0, y_shoulder, 0.0]],
        sections=_SECTIONS,
    )
    verts = torso.vertices.copy()
    t = (verts[:, 1] - y_hip) / (y_shoulder - y_hip)
    t = np.clip(t, 0.0, 1.0)
    radius = hip_radius + (shoulder_radius - hip_radius) * t
    verts[:, 0] *= radius
    verts[:, 2] *= radius
    torso.vertices = verts
    return torso


def _limb(
    radius: float, x: float, y_bottom: float, y_top: float
) -> trimesh.Trimesh:
    return trimesh.creation.cylinder(
        radius=radius,
        segment=[[x, y_bottom, 0.0], [x, y_top, 0.0]],
        sections=_SECTIONS,
    )


class ProceduralMannequinBuilder:
    """Assembles a faceless mannequin proxy from primitives (B4b).

    Uses every ``BodyProportions`` field: total height drives the vertical
    span, ``shoulder_width`` the upper-body/arm span, ``hip_width`` the lower
    body — so different proportions yield a visibly different bounding box.
    """

    def build(self, proportions: BodyProportions) -> AvatarMesh:
        height = proportions.height
        shoulder_half = proportions.shoulder_width / 2.0
        hip_half = proportions.hip_width / 2.0

        y_hip = _Y_HIP * height
        y_shoulder = _Y_SHOULDER * height
        y_neck_top = _Y_NECK_TOP * height
        y_arm_bottom = _Y_ARM_BOTTOM * height
        head_radius = _HEAD_RADIUS * height
        head_center = height - head_radius  # crown reaches the full height

        parts: list[trimesh.Trimesh] = []

        # Head (faceless sphere) + short neck.
        head = trimesh.creation.icosphere(subdivisions=2, radius=head_radius)
        head.apply_translation([0.0, head_center, 0.0])
        parts.append(head)
        parts.append(
            _limb(_NECK_RADIUS * height, 0.0, y_shoulder, y_neck_top)
        )

        # Tapered torso: shoulders wider than hips.
        parts.append(
            _tapered_torso(hip_half, shoulder_half, y_hip, y_shoulder)
        )

        # Arms hang from the shoulder span (these set the widest x-extent).
        arm_r = _ARM_RADIUS * height
        parts.append(_limb(arm_r, shoulder_half, y_arm_bottom, y_shoulder))
        parts.append(_limb(arm_r, -shoulder_half, y_arm_bottom, y_shoulder))

        # Legs from the hips down to the ground (y=0), so it stands upright.
        leg_r = _LEG_RADIUS * height
        leg_x = hip_half * _LEG_INSET
        parts.append(_limb(leg_r, leg_x, 0.0, y_hip))
        parts.append(_limb(leg_r, -leg_x, 0.0, y_hip))

        # Keep the primitives as distinct scene geometries (head, neck, torso,
        # two arms, two legs) — they export as one GLB but stay individually
        # inspectable. No connected-components/graph engine needed.
        scene = trimesh.Scene(parts)
        return AvatarMesh(scene=scene, notes=["procedural-mannequin (B4b)"])
