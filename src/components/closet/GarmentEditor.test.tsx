import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ArchiveProvider } from '../../app/providers/ArchiveProvider'
import { EditGarmentModal } from './GarmentEditor'
import { makeGarment } from '../../test/factories'

// The editor shares the required-name gate with the upload modal's confirm
// (both call isNameMissing). Upload-review can't be reached in jsdom (canvas),
// so this editor test carries the integration weight for the gate's wiring.
describe('EditGarmentModal — required name', () => {
  it('disables Save with a hint when the name is blank, re-enables when filled', async () => {
    const user = userEvent.setup()
    render(
      <ArchiveProvider>
        <EditGarmentModal
          garment={makeGarment({ name: 'Wool Coat' })}
          onClose={vi.fn()}
        />
      </ArchiveProvider>,
    )

    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeEnabled()

    await user.clear(name)
    expect(save).toBeDisabled()
    expect(
      screen.getByText('Name this archive piece before saving.'),
    ).toBeInTheDocument()

    await user.type(name, 'Charcoal Overcoat')
    expect(save).toBeEnabled()
    expect(
      screen.queryByText('Name this archive piece before saving.'),
    ).not.toBeInTheDocument()
  })
})
