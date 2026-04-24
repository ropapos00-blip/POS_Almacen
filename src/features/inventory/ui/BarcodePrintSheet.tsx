import type { RefObject } from 'react'
import { BarcodeLabel } from './BarcodeLabel'
import type { InventoryItemRow } from '../model/inventory.types'

interface BarcodePrintSheetProps {
  printRef: RefObject<HTMLDivElement | null>
  item: InventoryItemRow | null
  copies: number
  storeName: string
}

/**
 * Hoja de impresión oculta con N copias de la etiqueta.
 * El ref siempre está montado para que react-to-print lo encuentre.
 */
export function BarcodePrintSheet({
  printRef,
  item,
  copies,
  storeName,
}: BarcodePrintSheetProps) {
  return (
    <div className="sr-only">
      <div ref={printRef}>
        {item &&
          Array.from({ length: copies }).map((_, i) => (
            <BarcodeLabel key={i} item={item} storeName={storeName} />
          ))}
      </div>
    </div>
  )
}
