import JsBarcode from 'jsbarcode'
import { useEffect, useRef } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import type { InventoryItemRow } from '../model/inventory.types'

interface BarcodeLabelProps {
  item: InventoryItemRow
  storeName: string
}

/**
 * Renders a single barcode label using jsbarcode on an SVG element.
 * Used both inline (preview) and inside BarcodePrintSheet.
 */
export function BarcodeLabel({ item, storeName }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    JsBarcode(svgRef.current, item.barcode, {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: false,
      lineColor: '#000000',
      background: '#ffffff',
      margin: 2,
    })
  }, [item.barcode])

  return (
    <div
      style={{
        width: '72mm',
        padding: '3mm 4mm',
        boxSizing: 'border-box',
        background: 'white',
        color: 'black',
        fontFamily: 'sans-serif',
        border: '1px dashed #ccc',
        breakInside: 'avoid',
      }}
    >
      <p
        style={{
          fontSize: '11px',
          fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif",
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          textAlign: 'center',
          margin: '0 0 3px 0',
        }}
      >
        {storeName}
      </p>
      <div style={{ textAlign: 'center' }}>
        <svg ref={svgRef} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }} />
      </div>
      <p style={{ fontSize: '9px', textAlign: 'center', margin: '2px 0 0 0' }}>
        {item.reference}
      </p>
      <p style={{ fontSize: '10px', fontWeight: 'bold', textAlign: 'center', margin: '1px 0 0 0' }}>
        {formatCop(item.salePrice)}
      </p>
    </div>
  )
}

/** Preview inline (visible en la UI, sin sr-only) */
export function BarcodeLabelPreview({ item, storeName }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !item.barcode) return
    try {
      JsBarcode(svgRef.current, item.barcode, {
        format: 'CODE128',
        width: 1.2,
        height: 28,
        displayValue: false,
        lineColor: '#000000',
        background: '#ffffff',
        margin: 1,
      })
    } catch {
      // barcode inválido — no renderizar
    }
  }, [item.barcode])

  return (
    <div className="rounded border border-zinc-300 bg-white px-2 py-1 text-black" style={{ width: '130px' }}>
      <p className="store-logo-font text-[8px] font-extrabold uppercase tracking-widest text-center leading-tight">{storeName}</p>
      <div className="flex justify-center">
        <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
      </div>
      <p className="text-[7px] text-center leading-tight">{item.reference}</p>
      <p className="text-[8px] font-bold text-center leading-tight">{formatCop(item.salePrice)}</p>
    </div>
  )
}
