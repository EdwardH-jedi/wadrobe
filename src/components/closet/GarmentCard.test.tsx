// B3.9: the closet card's proxy 3D entry point and badge.
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeGarment } from '../../test/factories'
import { GarmentCard } from './GarmentCard'

const PREVIEW = {
  jobId: 'c'.repeat(32),
  generatedAt: 1_750_000_000_000,
  mode: 'single-sided' as const,
  method: 'extruded-alpha-contour',
  limitations: 'Proxy 3D preview only.',
}

describe('<GarmentCard /> — proxy 3D entry point (B3.9)', () => {
  it('shows "Create 3D preview" for a piece without a saved preview', async () => {
    const user = userEvent.setup()
    const onProxy3d = vi.fn()
    const garment = makeGarment()
    render(<GarmentCard garment={garment} onProxy3d={onProxy3d} />)

    expect(
      screen.queryByLabelText('Proxy 3D preview saved'),
    ).not.toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Create 3D preview' })
    await user.click(button)
    expect(onProxy3d).toHaveBeenCalledWith(garment)
  })

  it('shows "View 3D preview" and a badge for a piece with a saved preview', () => {
    const garment = makeGarment({ proxy3dPreview: PREVIEW })
    render(<GarmentCard garment={garment} onProxy3d={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: 'View 3D preview' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Proxy 3D preview saved')).toBeInTheDocument()
  })

  it('renders no 3D entry point when the callback is absent (other surfaces)', () => {
    render(<GarmentCard garment={makeGarment()} />)
    expect(
      screen.queryByRole('button', { name: /3D preview/ }),
    ).not.toBeInTheDocument()
  })
})
