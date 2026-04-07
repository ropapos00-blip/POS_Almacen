import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
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
  const user = useAuthStore((state) => state.user)

  if (!invoice) {
    return null
  }

  const businessName = user?.storeReceipt.legalName || user?.storeName || 'POS Retail'

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
            <p className="store-logo-font" style={{ fontSize: 34, margin: 0 }}>{businessName}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 34, margin: 0 }}>Factura</p>
            <p style={{ margin: '6px 0 0 0', fontWeight: 700 }}>{businessName}</p>
            {user?.storeReceipt.address ? <p style={{ margin: 0 }}>{user.storeReceipt.address}</p> : null}
            {user?.storeReceipt.city ? <p style={{ margin: 0 }}>{user.storeReceipt.city}</p> : null}
            {user?.storeReceipt.phone ? <p style={{ margin: 0 }}>{user.storeReceipt.phone}</p> : null}
            {user?.email ? <p style={{ margin: 0 }}>{user.email}</p> : null}
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
              <strong>Fecha</strong> {new Date(invoice.issued_at).toLocaleDateString()}
            </p>
            {invoice.due_date ? (
              <p style={{ margin: 0 }}>
                <strong>Vencimiento</strong> {new Date(invoice.due_date).toLocaleDateString()}
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
                <td>{item.description}</td>
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
          {invoice.payment_reference ? <p style={{ margin: '4px 0 0 0' }}>Referencia: {invoice.payment_reference}</p> : null}
          {invoice.notes ? <p style={{ margin: '4px 0 0 0' }}>Notas: {invoice.notes}</p> : null}
        </footer>
      </div>
    </div>
  )
}