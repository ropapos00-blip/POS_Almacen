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
export function BarcodeLabel({ item }: BarcodeLabelProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return
    JsBarcode(svgRef.current, item.barcode, {
      format: 'CODE128',
      width: 1.2,
      height: 16,
      displayValue: false,
      lineColor: '#000000',
      background: '#ffffff',
      margin: 1,
    })
  }, [item.barcode])

  return (
    <div
      style={{
        width: '32mm',
        height: '15mm',
        padding: '0.5mm 1.5mm',
        boxSizing: 'border-box',
        background: 'white',
        color: 'black',
        fontFamily: 'sans-serif',
        overflow: 'hidden',
        breakInside: 'avoid',
      }}
    >
      <div style={{ textAlign: 'center', lineHeight: 0 }}>
        <svg ref={svgRef} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }} />
      </div>
      <p style={{ fontSize: '6px', textAlign: 'center', margin: '0', lineHeight: 1.1 }}>
        {item.reference}
      </p>
      <p style={{ fontSize: '14px', fontWeight: 'bold', textAlign: 'center', margin: '0', lineHeight: 1.2 }}>
        {formatCop(item.salePrice)}
      </p>
    </div>
  )
}

/** Preview inline (visible en la UI, sin sr-only) */
export function BarcodeLabelPreview({ item }: BarcodeLabelProps) {
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
      <div className="flex justify-center">
        <svg ref={svgRef} style={{ display: 'block', maxWidth: '100%' }} />
      </div>
      <p className="text-[7px] text-center leading-tight">{item.reference}</p>
      <p className="text-[12px] font-bold text-center leading-tight">{formatCop(item.salePrice)}</p>
    </div>
  )
}
