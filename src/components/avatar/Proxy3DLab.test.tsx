import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Proxy3DLab } from './Proxy3DLab'
import { PROXY3D_COPY, type Proxy3dRecord } from './proxy3dFlow'
import { Proxy3dApiError, createProxy3d } from './proxy3dApi'
import { detectUsableAlpha, runProxyCutout } from './proxy3dCutout'

// The viewer would dynamic-import three.js — keep WebGL out of jsdom.
vi.mock('./GlbViewer', () => ({
  GlbViewer: ({ src }: { src: string }) => (
    <div data-testid="glb-viewer" data-src={src} />
  ),
}))
vi.mock('./proxy3dApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./proxy3dApi')>()
  return { ...actual, createProxy3d: vi.fn() }
})
// Alpha probing and the local flood fill need real canvas/decoding — mocked.
vi.mock('./proxy3dCutout', () => ({
  detectUsableAlpha: vi.fn(),
  runProxyCutout: vi.fn(),
}))

const mockCreate = vi.mocked(createProxy3d)
const mockDetect = vi.mocked(detectUsableAlpha)
const mockCutout = vi.mocked(runProxyCutout)

const RECORD: Proxy3dRecord = {
  job_id: 'c'.repeat(32),
  status: 'done',
  method: 'extruded-alpha-contour',
  alpha_mask_used: true,
  input: { width: 240, height: 320, has_alpha: true },
  mesh: { vertices: 2552, faces: 5100 },
  result_url: `/api/proxy-3d/${'c'.repeat(32)}/result.glb`,
  limitations:
    'Proxy 3D preview only. It is not real virtual try-on, not accurate ' +
    'garment geometry, and not a fit or size estimate.',
  created_at: 1_750_000_000,
}

const PLANE_RECORD: Proxy3dRecord = {
  ...RECORD,
  job_id: 'd'.repeat(32),
  method: 'textured-plane',
  alpha_mask_used: false,
  input: { width: 200, height: 160, has_alpha: false },
  mesh: { vertices: 4, faces: 2 },
  result_url: `/api/proxy-3d/${'d'.repeat(32)}/result.glb`,
}

const pngFile = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'tee.png', {
    type: 'image/png',
  })

const selectFile = (file: File) => {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('<Proxy3DLab />', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockDetect.mockReset()
    mockDetect.mockResolvedValue('usable')
    mockCutout.mockReset()
    // jsdom has no object URLs; the component treats them as optional.
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock-preview'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    delete (URL as Partial<typeof URL>).createObjectURL
    delete (URL as Partial<typeof URL>).revokeObjectURL
  })

  it('rejects a non-PNG file with an honest message', () => {
    render(<Proxy3DLab />)
    selectFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/not a PNG/i)
    // Nothing selected — the generate button stays disabled.
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeDisabled()
  })

  it('shows file name, size and thumbnail after selecting a PNG', async () => {
    render(<Proxy3DLab />)
    selectFile(pngFile())

    expect(await screen.findByText('tee.png')).toBeInTheDocument()
    expect(screen.getByText('4 B')).toBeInTheDocument()
    expect(document.querySelector('.proxy3dlab__thumb')).toHaveAttribute(
      'src',
      'blob:mock-preview',
    )
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeEnabled()
  })

  it('uploads and renders the honest generation report with a download link', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValueOnce(RECORD)
    render(<Proxy3DLab />)
    selectFile(pngFile())
    await screen.findByText('tee.png')

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    expect(
      await screen.findByText(PROXY3D_COPY.readyTitle),
    ).toBeInTheDocument()
    // Honest result verdict for the extruded method.
    expect(
      screen.getByText('Silhouette proxy 3D preview'),
    ).toBeInTheDocument()
    // Metadata from the backend record.
    expect(screen.getByText(RECORD.job_id)).toBeInTheDocument()
    expect(screen.getByText(/240×320px/)).toBeInTheDocument()
    expect(screen.getByText(/Extruded silhouette card/)).toBeInTheDocument()
    expect(screen.getByText('2,552')).toBeInTheDocument()
    expect(screen.getByText('5,100')).toBeInTheDocument()
    // The honest limitations text is shown verbatim.
    expect(screen.getByText(RECORD.limitations)).toBeInTheDocument()
    // Download link points at the backend result.
    const download = screen.getByRole('link', {
      name: new RegExp(PROXY3D_COPY.downloadButton),
    })
    expect(download).toHaveAttribute('href', RECORD.result_url)
    expect(download).toHaveAttribute('download', 'result.glb')
    // The (mocked) viewer is mounted with the result URL.
    expect(screen.getByTestId('glb-viewer')).toHaveAttribute(
      'data-src',
      RECORD.result_url,
    )
  })

  it('renders backend validation errors (no backend hint) and supports retrying', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValueOnce(
      new Proxy3dApiError('The PNG is fully transparent.', 422),
    )
    render(<Proxy3DLab />)
    selectFile(pngFile())
    await screen.findByText('tee.png')

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(PROXY3D_COPY.errorTitle)
    expect(alert).toHaveTextContent('The PNG is fully transparent.')
    // The backend DID respond — no "is it running?" hint.
    expect(alert).not.toHaveTextContent(PROXY3D_COPY.backendHint)

    // Retry succeeds.
    mockCreate.mockResolvedValueOnce(RECORD)
    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.retryButton }),
    )
    expect(
      await screen.findByText(PROXY3D_COPY.readyTitle),
    ).toBeInTheDocument()
  })

  it('shows the backend hint only for connectivity failures', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValueOnce(
      new Proxy3dApiError('Could not reach the local proxy-3D backend.', null),
    )
    render(<Proxy3DLab />)
    selectFile(pngFile())
    await screen.findByText('tee.png')

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not reach/i)
    expect(alert).toHaveTextContent(PROXY3D_COPY.backendHint)
  })

  it('start over clears the selection and any result', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValueOnce(RECORD)
    render(<Proxy3DLab />)
    selectFile(pngFile())
    await screen.findByText('tee.png')
    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )
    await screen.findByText(PROXY3D_COPY.readyTitle)

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.resetButton }),
    )
    expect(screen.queryByText(PROXY3D_COPY.readyTitle)).not.toBeInTheDocument()
    expect(screen.queryByText('tee.png')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview')
  })

  describe('cutout-first (B3.6)', () => {
    it('warns on a no-alpha PNG and gates generation behind explicit choices', async () => {
      mockDetect.mockResolvedValue('none')
      render(<Proxy3DLab />)
      selectFile(pngFile())

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(PROXY3D_COPY.noAlphaTitle)
      expect(alert).toHaveTextContent(PROXY3D_COPY.noAlphaWarning)
      // Both explicit choices exist; the generic generate button does NOT.
      expect(
        screen.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: PROXY3D_COPY.flatCardButton }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: PROXY3D_COPY.submitButton }),
      ).not.toBeInTheDocument()
      // No upload happened on its own.
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('generates the flat card only after the explicit fallback choice', async () => {
      const user = userEvent.setup()
      mockDetect.mockResolvedValue('none')
      mockCreate.mockResolvedValueOnce(PLANE_RECORD)
      render(<Proxy3DLab />)
      selectFile(pngFile())
      await screen.findByRole('alert')

      await user.click(
        screen.getByRole('button', { name: PROXY3D_COPY.flatCardButton }),
      )

      await screen.findByText(PROXY3D_COPY.readyTitle)
      // The original file (not a cutout) was sent.
      expect(mockCreate).toHaveBeenCalledWith(expect.any(File), 'tee.png')
      // Honest fallback verdict.
      expect(screen.getByText('Flat image card fallback')).toBeInTheDocument()
      expect(screen.getByText(/Flat textured plane/)).toBeInTheDocument()
    })

    it('cutout-first sends the transparent PNG and yields a silhouette proxy', async () => {
      const user = userEvent.setup()
      mockDetect.mockResolvedValue('none')
      const cutoutBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
        type: 'image/png',
      })
      mockCutout.mockResolvedValueOnce({
        status: 'success',
        blob: cutoutBlob,
        previewUrl: 'data:image/png;base64,AA==',
      })
      mockCreate.mockResolvedValueOnce(RECORD)
      render(<Proxy3DLab />)
      selectFile(pngFile())
      await screen.findByRole('alert')

      await user.click(
        screen.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
      )
      // The local cutout is previewed before anything is uploaded.
      expect(
        await screen.findByText(PROXY3D_COPY.cutoutReadyTitle),
      ).toBeInTheDocument()
      expect(mockCreate).not.toHaveBeenCalled()

      await user.click(
        screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
      )
      await screen.findByText(PROXY3D_COPY.readyTitle)
      // The CUTOUT blob was sent, not the original file.
      expect(mockCreate).toHaveBeenCalledWith(cutoutBlob, 'cutout.png')
      expect(
        screen.getByText('Silhouette proxy 3D preview'),
      ).toBeInTheDocument()
    })

    it('keeps the explicit choices when the local cutout fails', async () => {
      const user = userEvent.setup()
      mockDetect.mockResolvedValue('none')
      mockCutout.mockResolvedValueOnce({
        status: 'unavailable',
        reason:
          'Background removal was unavailable for this image — it works ' +
          'best on a plain, flat-lay background.',
      })
      render(<Proxy3DLab />)
      selectFile(pngFile())
      await screen.findByRole('alert')

      await user.click(
        screen.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
      )

      expect(
        await screen.findByText(/works best on a plain, flat-lay background/),
      ).toBeInTheDocument()
      // Both choices remain; nothing was uploaded.
      expect(
        screen.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: PROXY3D_COPY.flatCardButton }),
      ).toBeInTheDocument()
      expect(mockCreate).not.toHaveBeenCalled()
    })
  })
})
