// The studio room: a premium, interactive scene. Each alcove is a clickable
// zone that opens the matching view.
import type { GarmentItem } from '../../domain/garmentTypes'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'
import { useArchive } from '../../app/providers/useArchive'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { RoomZone } from './RoomZone'
import { ClothingRack } from './ClothingRack'
import { MannequinPreview } from './MannequinPreview'
import { MirrorPreview } from './MirrorPreview'
import type { StudioView } from './views'

export interface StudioSceneProps {
  onOpen: (view: StudioView) => void
  onUpload: () => void
}

const MAX_BOARD_PINS = 3
const MAX_SHELF_PAIRS = 4

export function StudioScene({ onOpen, onUpload }: StudioSceneProps) {
  const {
    garments,
    savedOutfits,
    garmentsByCategory,
    getGarment,
    loadSampleArchive,
  } = useArchive()
  const shoes = garmentsByCategory('shoes').slice(0, MAX_SHELF_PAIRS)
  const pins = savedOutfits.slice(0, MAX_BOARD_PINS)

  return (
    <div className="studio">
      <div className="stage">
        <div className="stage__spot" />
        <div className="room">
          <RoomZone area="board" label="Wall Board" onClick={() => onOpen('outfits')}>
            <div className="wallboard">
              {pins.length === 0 ? (
                <span className="muted" style={{ fontSize: 12, margin: 'auto' }}>
                  Pin your saved looks here
                </span>
              ) : (
                pins.map((look) => {
                  const cover = look.coverHex
                  const images = Object.values(look.selection)
                    .filter((id): id is string => id !== null)
                    .map((id) => getGarment(id))
                    .filter((g): g is GarmentItem => g !== undefined)
                    .slice(0, 3)
                  return (
                    <div key={look.id} className="wallboard__pin">
                      <div
                        className="wallboard__cover"
                        style={{ background: cover }}
                      />
                      <div className="wallboard__strip">
                        {images.map((g) => (
                          <img
                            key={g.id}
                            src={getGarmentDisplayImage(g)}
                            alt={g.name}
                          />
                        ))}
                      </div>
                      <div className="wallboard__name">{look.name}</div>
                    </div>
                  )
                })
              )}
            </div>
          </RoomZone>

          <RoomZone area="rack" label="Clothing Rack" onClick={() => onOpen('closet')}>
            <ClothingRack garments={garments} />
          </RoomZone>

          <RoomZone
            area="mannequin"
            label="The Mannequin"
            onClick={() => onOpen('mirror')}
          >
            <MannequinPreview compact />
          </RoomZone>

          <RoomZone area="mirror" label="The Mirror" onClick={() => onOpen('mirror')}>
            <MirrorPreview variant="scene" />
          </RoomZone>

          <RoomZone area="shelf" label="Shoe Shelf" onClick={() => onOpen('closet')}>
            <div className="shelf">
              <div className="shelf__row">
                {shoes.length === 0 ? (
                  <span className="muted" style={{ fontSize: 11 }}>
                    No shoes yet
                  </span>
                ) : (
                  shoes.map((shoe) => (
                    <div key={shoe.id} className="shelf__pair">
                      <img src={getGarmentDisplayImage(shoe)} alt={shoe.name} />
                    </div>
                  ))
                )}
              </div>
              <div className="shelf__plank" />
            </div>
          </RoomZone>
        </div>

        {garments.length === 0 && (
          <div className="studio__empty">
            <span className="eyebrow">The Archive</span>
            <h2 className="display">Your studio is empty</h2>
            <p>
              Upload a clothing photo to archive your first piece — or load the
              sample archive to step inside the studio.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 4 }}>
              <Button variant="primary" onClick={onUpload}>
                <Icon name="upload" size={16} />
                Upload a piece
              </Button>
              <Button variant="ghost" onClick={loadSampleArchive}>
                Load sample
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
