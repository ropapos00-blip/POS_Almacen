import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { formatDateColombia } from '../../../shared/utils/dateTime'
import type { WholesaleInvoiceRow, WholesalePaymentMethod } from '../model/wholesale.types'

function paymentLabel(method: WholesalePaymentMethod) {
  if (method === 'cash') return 'Efectivo'
  if (method === 'card') return 'Tarjeta'
  if (method === 'transfer') return 'Transferencia'
  if (method === 'mixed') return 'Mixto'
  return 'Credito'
}

export function WholesaleInvoiceLetter({
  invoice,
  printRef,
}: {
  invoice: WholesaleInvoiceRow | null
  printRef: RefObject<HTMLDivElement | null>
}) {
  if (!invoice) {
    return null
  }

  return (
    <div className="sr-only">
      <div ref={printRef} className="print-letter-invoice bg-white text-black">
        <style>
          {`
            @page {
              size: letter;
              margin: 14mm;
            }

            .print-letter-invoice {
              width: 100%;
              min-height: 100%;
              padding: 8mm;
              font-family: Arial, sans-serif;
              font-size: 12px;
              line-height: 1.35;
            }

            .print-grid-head {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
            }

            .print-box {
              background: #f0f2f4;
              border-radius: 4px;
              padding: 10px;
              margin-top: 12px;
            }

            .print-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }

            .print-table th,
            .print-table td {
              border-top: 1px solid #d5d8dd;
              padding: 8px 6px;
              text-align: left;
            }

            .print-table th.num,
            .print-table td.num {
              text-align: right;
              white-space: nowrap;
            }

            .print-totals {
              margin-top: 14px;
              margin-left: auto;
              width: 320px;
            }

            .print-totals-row {
              display: flex;
              justify-content: space-between;
              padding: 4px 0;
              border-bottom: 1px solid #e3e6ea;
            }

            .print-balance {
              margin-top: 10px;
              margin-left: auto;
              width: 320px;
              background: #eceff2;
              padding: 10px;
            }
          `}
        </style>

        <header className="print-grid-head">
          <div>
            <p className="store-logo-font uppercase" style={{ fontSize: 34, margin: 0, fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}>
              LICKAN42
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 34, margin: 0 }}>Factura</p>
            <p className="store-logo-font uppercase" style={{ margin: '6px 0 0 0', fontWeight: 700, fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}>
              LICKAN42
            </p>
            <p style={{ margin: 0 }}>Cra 20 no 19 25</p>
            <p style={{ margin: 0 }}>Centro</p>
            <p style={{ margin: 0 }}>Manizales Caldas 170001</p>
            <p style={{ margin: 0 }}>CO</p>
            <p style={{ margin: 0 }}>3104115491</p>
            <p style={{ margin: 0 }}>camisetalickan42@gmail.com</p>
          </div>
        </header>

        <section className="print-box" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700 }}>Para</p>
            <p style={{ margin: 0 }}>{invoice.customer_name ?? 'Cliente general'}</p>
            {invoice.customer_phone ? <p style={{ margin: 0 }}>{invoice.customer_phone}</p> : null}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0 }}>
              <strong>Factura #</strong> {invoice.invoice_number}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Fecha</strong> {formatDateColombia(invoice.issued_at)}
            </p>
            {invoice.due_date ? (
              <p style={{ margin: 0 }}>
                <strong>Vencimiento</strong> {formatDateColombia(invoice.due_date)}
              </p>
            ) : null}
          </div>
        </section>

        <table className="print-table">
          <thead>
            <tr>
              <th>Articulo</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.wholesale_invoice_items ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.reference || item.description}</td>
                <td className="num">{item.quantity}</td>
                <td className="num">{formatCop(item.unit_price)}</td>
                <td className="num">{formatCop(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="print-totals">
          <div className="print-totals-row">
            <span>Total parcial</span>
            <span>{formatCop(invoice.subtotal)}</span>
          </div>
          <div className="print-totals-row">
            <span>Descuento</span>
            <span>{formatCop(invoice.discount_total)}</span>
          </div>
          <div className="print-totals-row" style={{ fontWeight: 700 }}>
            <span>Total</span>
            <span>{formatCop(invoice.grand_total)}</span>
          </div>
        </section>

        <section className="print-balance">
          <p style={{ margin: 0, color: '#475467' }}>Saldo deudor</p>
          <p style={{ margin: '8px 0 0 0', textAlign: 'right', fontSize: 34 }}>{formatCop(invoice.balance_due)}</p>
        </section>

        <footer style={{ marginTop: 24 }}>
          <p style={{ margin: 0, fontSize: 25 }}>Instruccion de pago</p>
          <p style={{ margin: '6px 0 0 0' }}>Metodo: {paymentLabel(invoice.payment_method)}</p>
        </footer>
      </div>
    </div>
  )
}