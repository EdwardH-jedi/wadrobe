// Minimal in-browser GLB viewer for the Proxy 3D Lab. three.js (and its
// loader/controls) is loaded via dynamic import ONLY when this component
// mounts, so Track A's bundle and startup are untouched. Everything created
// here — renderer, controls, animation frame, geometries, materials,
// textures — is disposed on unmount. If WebGL or module loading fails, a
// clear fallback message is shown instead (the GLB stays downloadable).
import { useEffect, useRef, useState } from 'react'
import { PROXY3D_COPY } from './proxy3dFlow'

export interface GlbViewerProps {
  /** URL of the GLB (a same-origin path or an object URL). */
  src: string
}

type ViewerStatus = 'loading' | 'ready' | 'failed'

export function GlbViewer({ src }: GlbViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<ViewerStatus>('loading')

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let disposed = false
    const disposers: Array<() => void> = []
    const disposeAll = () => {
      while (disposers.length) {
        try {
          disposers.pop()!()
        } catch {
          // Best-effort cleanup; never throw from unmount.
        }
      }
    }

    setStatus('loading')

    const start = async () => {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }] = await Promise.all([
          import('three'),
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/controls/OrbitControls.js'),
        ])
        if (disposed) return

        const width = host.clientWidth || 640
        const height = host.clientHeight || 420

        // Throws when WebGL is unavailable -> caught below as a fallback.
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        // Cap the pixel ratio. On a 3x phone an uncapped ratio renders ~9x the
        // pixels of a 1x display for no visible gain on a small preview, and it
        // is the fastest way to make a mid-range device drop frames.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setSize(width, height)
        host.appendChild(renderer.domElement)
        disposers.push(() => {
          renderer.dispose()
          renderer.domElement.remove()
        })

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 50)
        scene.add(new THREE.AmbientLight(0xffffff, 1.2))
        const key = new THREE.DirectionalLight(0xffffff, 1.6)
        key.position.set(1.5, 2, 2.5)
        scene.add(key)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        disposers.push(() => controls.dispose())

        // The canvas was sized once at mount, so it stretched on any container
        // change — window resize, sidebar collapse, device rotation. Observe the
        // host instead of the window: it also catches layout-only changes.
        const applySize = () => {
          const w = host.clientWidth || width
          const h = host.clientHeight || height
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(applySize)
          observer.observe(host)
          disposers.push(() => observer.disconnect())
        } else {
          window.addEventListener('resize', applySize)
          disposers.push(() => window.removeEventListener('resize', applySize))
        }

        const gltf = await new GLTFLoader().loadAsync(src)
        const root = gltf.scene
        disposers.push(() => {
          root.traverse((obj) => {
            const mesh = obj as InstanceType<typeof THREE.Mesh>
            if (!mesh.isMesh) return
            mesh.geometry.dispose()
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material]
            for (const material of materials) {
              const textured = material as { map?: { dispose(): void } | null }
              textured.map?.dispose()
              material.dispose()
            }
          })
        })
        if (disposed) {
          disposeAll()
          return
        }

        // Center the model and pull the camera back to frame it.
        const box = new THREE.Box3().setFromObject(root)
        root.position.sub(box.getCenter(new THREE.Vector3()))
        const size = box.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        camera.position.set(maxDim * 0.35, maxDim * 0.1, maxDim * 1.9)
        controls.target.set(0, 0, 0)
        scene.add(root)

        let frame = 0
        const renderLoop = () => {
          controls.update()
          renderer.render(scene, camera)
          frame = requestAnimationFrame(renderLoop)
        }
        frame = requestAnimationFrame(renderLoop)
        disposers.push(() => cancelAnimationFrame(frame))

        setStatus('ready')
      } catch {
        disposeAll()
        if (!disposed) setStatus('failed')
      }
    }

    void start()
    return () => {
      disposed = true
      disposeAll()
    }
  }, [src])

  return (
    <div className="glbviewer">
      <div ref={hostRef} className="glbviewer__canvas" />
      {status !== 'ready' && (
        <div className="glbviewer__note">
          {status === 'loading'
            ? PROXY3D_COPY.viewerLoading
            : PROXY3D_COPY.viewerFallback}
        </div>
      )}
      <div className="glbviewer__caption eyebrow">
        {PROXY3D_COPY.viewerCaption}
      </div>
    </div>
  )
}
