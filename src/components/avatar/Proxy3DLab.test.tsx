import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Proxy3DLab } from './Proxy3DLab'
import { PROXY3D_COPY, type Proxy3dRecord } from './proxy3dFlow'
import { Proxy3dApiError, createProxy3d } from './proxy3dApi'

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

const mockCreate = vi.mocked(createProxy3d)

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

  it('shows file name, size and thumbnail after selecting a PNG', () => {
    render(<Proxy3DLab />)
    selectFile(pngFile())

    expect(screen.getByText('tee.png')).toBeInTheDocument()
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

    await user.click(
      screen.getByRole('button', { name: PROXY3D_COPY.submitButton }),
    )

    expect(
      await screen.findByText(PROXY3D_COPY.readyTitle),
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
})
