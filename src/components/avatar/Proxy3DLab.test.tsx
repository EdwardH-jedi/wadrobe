import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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

const SINGLE_RECORD: Proxy3dRecord = {
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
  sides: 'single',
  back_input: null,
  back_alpha_mask_used: null,
}

const DUAL_RECORD: Proxy3dRecord = {
  ...SINGLE_RECORD,
  job_id: 'e'.repeat(32),
  method: 'extruded-alpha-contour-dual',
  result_url: `/api/proxy-3d/${'e'.repeat(32)}/result.glb`,
  sides: 'dual',
  back_input: { width: 100, height: 140, has_alpha: true },
  back_alpha_mask_used: true,
}

const PLANE_RECORD: Proxy3dRecord = {
  ...SINGLE_RECORD,
  job_id: 'd'.repeat(32),
  method: 'textured-plane',
  alpha_mask_used: false,
  input: { width: 200, height: 160, has_alpha: false },
  mesh: { vertices: 4, faces: 2 },
  result_url: `/api/proxy-3d/${'d'.repeat(32)}/result.glb`,
}

const pngFile = (name = 'tee.png') =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, {
    type: 'image/png',
  })

const selectFile = (side: 'front' | 'back', file: File) => {
  const input = document.querySelector(
    `input[type="file"][data-side="${side}"]`,
  ) as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

const sideCard = (side: 'front' | 'back') =>
  within(
    document.querySelector(`.proxy3dlab__side[data-side="${side}"]`) as HTMLElement,
  )

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

  it('requires a front image before generating', () => {
    render(<Proxy3DLab />)
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeDisabled()
  })

  it('rejects a non-PNG file with an honest message', () => {
    render(<Proxy3DLab />)
    selectFile('front', new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/not a PNG/i)
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeDisabled()
  })

  it('single-sided: front only uploads without a back file', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValueOnce(SINGLE_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')

    const button = screen.getByRole('button', {
      name: PROXY3D_COPY.submitButton,
    })
    expect(button).toBeEnabled()
    await user.click(button)

    await screen.findByText(PROXY3D_COPY.readyTitle)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.any(File),
      'tee.png',
      expect.objectContaining({ back: undefined }),
    )
    expect(
      screen.getByText('Single-sided silhouette proxy 3D preview'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(PROXY3D_COPY.metaSidesSingle),
    ).toBeInTheDocument()
    const download = screen.getByRole('link', {
      name: new RegExp(PROXY3D_COPY.downloadButton),
    })
    expect(download).toHaveAttribute('href', SINGLE_RECORD.result_url)
    expect(screen.getByTestId('glb-viewer')).toHaveAttribute(
      'data-src',
      SINGLE_RECORD.result_url,
    )
  })

  it('dual-sided: both transparent sides upload front + back', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValueOnce(DUAL_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')
    selectFile('back', pngFile('tee-back.png'))
    await screen.findByText('tee-back.png')

    // The button announces the dual generation.
    const button = screen.getByRole('button', {
      name: PROXY3D_COPY.submitDualButton,
    })
    await user.click(button)

    await screen.findByText(PROXY3D_COPY.readyTitle)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.any(File),
      'tee.png',
      expect.objectContaining({ backName: 'tee-back.png' }),
    )
    const sentBack = mockCreate.mock.calls[0][2]?.back
    expect(sentBack).toBeInstanceOf(File)
    expect((sentBack as File).name).toBe('tee-back.png')

    expect(
      screen.getByText('Dual-sided silhouette proxy 3D preview'),
    ).toBeInTheDocument()
    expect(screen.getByText(PROXY3D_COPY.metaSidesDual)).toBeInTheDocument()
    expect(screen.getByText(PROXY3D_COPY.rotateHint)).toBeInTheDocument()
    expect(screen.getByText(/100×140px/)).toBeInTheDocument()
  })

  it('warns on a no-alpha FRONT and gates generation behind explicit choices', async () => {
    mockDetect.mockResolvedValue('none')
    render(<Proxy3DLab />)
    selectFile('front', pngFile())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(PROXY3D_COPY.noAlphaTitle)
    expect(alert).toHaveTextContent(PROXY3D_COPY.noAlphaWarning)
    expect(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.cutoutButton,
      }),
    ).toBeInTheDocument()
    expect(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.flatCardButton,
      }),
    ).toBeInTheDocument()
    // The main generate button is blocked.
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeDisabled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('warns on a no-alpha BACK independently and offers back-specific choices', async () => {
    mockDetect.mockResolvedValueOnce('usable') // front
    mockDetect.mockResolvedValueOnce('none') // back
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')
    selectFile('back', pngFile('back.png'))

    const back = sideCard('back')
    expect(await back.findByRole('alert')).toHaveTextContent(
      PROXY3D_COPY.noAlphaBackWarning,
    )
    expect(
      back.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
    ).toBeInTheDocument()
    expect(
      back.getByRole('button', { name: PROXY3D_COPY.backUseAsIsButton }),
    ).toBeInTheDocument()
    expect(
      back.getByRole('button', { name: PROXY3D_COPY.removeBackButton }),
    ).toBeInTheDocument()
    // Blocked until the back is resolved.
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    ).toBeDisabled()

    // Explicit "use as is" unblocks a dual generation.
    fireEvent.click(
      back.getByRole('button', { name: PROXY3D_COPY.backUseAsIsButton }),
    )
    expect(
      screen.getByRole('button', { name: PROXY3D_COPY.submitDualButton }),
    ).toBeEnabled()
  })

  it('front cutout-first: sends the cutout blob, single-sided', async () => {
    const user = userEvent.setup()
    mockDetect.mockResolvedValue('none')
    const cutoutBlob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    mockCutout.mockResolvedValueOnce({
      status: 'success',
      blob: cutoutBlob,
      previewUrl: 'data:image/png;base64,AA==',
    })
    mockCreate.mockResolvedValueOnce(SINGLE_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByRole('alert')

    await user.click(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.cutoutButton,
      }),
    )
    expect(
      await screen.findByText(PROXY3D_COPY.cutoutReadyTitle),
    ).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )
    await screen.findByText(PROXY3D_COPY.readyTitle)
    expect(mockCreate).toHaveBeenCalledWith(
      cutoutBlob,
      'front-cutout.png',
      expect.objectContaining({ back: undefined }),
    )
  })

  it('back cutout-first: sends front original + back cutout blob', async () => {
    const user = userEvent.setup()
    mockDetect.mockResolvedValueOnce('usable') // front
    mockDetect.mockResolvedValueOnce('none') // back
    const backCutout = new Blob([new Uint8Array([2])], { type: 'image/png' })
    mockCutout.mockResolvedValueOnce({
      status: 'success',
      blob: backCutout,
      previewUrl: 'data:image/png;base64,AA==',
    })
    mockCreate.mockResolvedValueOnce(DUAL_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')
    selectFile('back', pngFile('back.png'))
    const back = sideCard('back')
    await back.findByRole('alert')

    await user.click(
      back.getByRole('button', { name: PROXY3D_COPY.cutoutButton }),
    )
    await screen.findByText(PROXY3D_COPY.cutoutReadyTitle)

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitDualButton }),
    )
    await screen.findByText(PROXY3D_COPY.readyTitle)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.any(File),
      'tee.png',
      expect.objectContaining({ back: backCutout, backName: 'back-cutout.png' }),
    )
  })

  it('explicit flat card uses the front only and is labeled as a fallback', async () => {
    const user = userEvent.setup()
    mockDetect.mockResolvedValue('none')
    mockCreate.mockResolvedValueOnce(PLANE_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByRole('alert')

    await user.click(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.flatCardButton,
      }),
    )

    await screen.findByText(PROXY3D_COPY.readyTitle)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.any(File),
      'tee.png',
      expect.objectContaining({ back: undefined }),
    )
    expect(screen.getByText('Flat image card fallback')).toBeInTheDocument()
  })

  it('keeps explicit choices when a cutout fails', async () => {
    const user = userEvent.setup()
    mockDetect.mockResolvedValue('none')
    mockCutout.mockResolvedValueOnce({
      status: 'unavailable',
      reason:
        'Background removal was unavailable for this image — it works ' +
        'best on a plain, flat-lay background.',
    })
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByRole('alert')

    await user.click(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.cutoutButton,
      }),
    )

    expect(
      await screen.findByText(/works best on a plain, flat-lay background/),
    ).toBeInTheDocument()
    expect(
      sideCard('front').getByRole('button', {
        name: PROXY3D_COPY.flatCardButton,
      }),
    ).toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('renders backend validation errors without the backend hint', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValueOnce(
      new Proxy3dApiError('The PNG is fully transparent.', 422),
    )
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(PROXY3D_COPY.errorTitle)
    expect(alert).not.toHaveTextContent(PROXY3D_COPY.backendHint)

    // Retry from failed succeeds.
    mockCreate.mockResolvedValueOnce(SINGLE_RECORD)
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
    selectFile('front', pngFile())
    await screen.findByText('tee.png')

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(PROXY3D_COPY.backendHint)
  })

  it('start over clears both sides and any result', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValueOnce(DUAL_RECORD)
    render(<Proxy3DLab />)
    selectFile('front', pngFile())
    await screen.findByText('tee.png')
    selectFile('back', pngFile('tee-back.png'))
    await screen.findByText('tee-back.png')
    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitDualButton }),
    )
    await screen.findByText(PROXY3D_COPY.readyTitle)

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.resetButton }),
    )
    expect(screen.queryByText(PROXY3D_COPY.readyTitle)).not.toBeInTheDocument()
    expect(screen.queryByText('tee.png')).not.toBeInTheDocument()
    expect(screen.queryByText('tee-back.png')).not.toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })
})
