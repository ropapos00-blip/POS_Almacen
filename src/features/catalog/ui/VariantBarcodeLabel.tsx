import { useEffect, useRef } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import type { ProductVariant } from '../model/catalog.types'

export function VariantBarcodeLabel({
  variant,
  labelRef,
}: {
  variant: ProductVariant | null
  labelRef: React.RefObject<HTMLDivElement | null>
}) {
  const barcodeSvgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!variant || !barcodeSvgRef.current) {
      return
    }

    let disposed = false

    void import('jsbarcode').then((mod) => {
      if (disposed || !barcodeSvgRef.current) {
        return
      }

      mod.default(barcodeSvgRef.current, variant.barcode, {
        format: 'CODE128',
        width: 1.5,
        height: 48,
        displayValue: true,
        fontSize: 12,
        margin: 2,
      })
    })

    return () => {
      disposed = true
    }
  }, [variant])

  if (!variant) {
    return null
  }

  return (
    <div className="sr-only">
      <div ref={labelRef} className="w-75 bg-white p-3 text-black">
        <h3 className="text-sm font-bold">Etiqueta POS Retail</h3>
        <p className="mt-1 text-xs">SKU: {variant.sku}</p>
        <p className="text-xs">Talla: {variant.size}</p>
        <p className="text-xs">Color: {variant.color}</p>
        <p className="mt-1 text-xs">Precio: {formatCop(variant.sale_price)}</p>
        <div className="mt-2">
          <svg ref={barcodeSvgRef} />
        </div>
      </div>
    </div>
  )
}
