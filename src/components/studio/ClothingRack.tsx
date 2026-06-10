import type { GarmentItem } from '../../domain/garmentTypes'
import { getGarmentDisplayImage } from '../../domain/garmentAsset'

export interface ClothingRackProps {
  garments: GarmentItem[]
}

const MAX_ON_RAIL = 9

/** Visual representation of the archive as garments hanging on a rail. */
export function ClothingRack({ garments }: ClothingRackProps) {
  const visible = garments.slice(0, MAX_ON_RAIL)

  return (
    <div className="rack">
      <div className="rack__bar" />
      <div className="rack__items">
        {visible.map((garment, i) => (
          <div
            key={garment.id}
            className="rack__item"
            style={{ animationDelay: `${(i % 4) * 0.4}s` }}
          >
            <span className="rack__hook" />
            <div className="rack__garment">
              <img src={getGarmentDisplayImage(garment)} alt={garment.name} />
            </div>
          </div>
        ))}
      </div>
      <div className="rack__count">
        {garments.length === 0
          ? 'Rail is empty'
          : `${garments.length} ${garments.length === 1 ? 'piece' : 'pieces'} archived`}
      </div>
    </div>
  )
}
