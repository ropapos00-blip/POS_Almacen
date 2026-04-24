import type { RefObject } from 'react'
import { formatCop } from '../../../shared/utils/currency'
import { useAuthStore } from '../../auth/model/useAuthStore'
import type { ManualExpenseRow } from '../model/manualInvoices.types'

export function ExpenseReceipt({
  receiptRef,
  expense,
}: {
  receiptRef: RefObject<HTMLDivElement | null>
  expense: ManualExpenseRow | null
}) {
  const user = useAuthStore((state) => state.user)

  const businessName = user?.storeReceipt.legalName || user?.storeName || 'POS Retail'

  return (
    <div className="sr-only">
      <div
        ref={receiptRef}
        className="text-black"
        style={{ width: '56mm', margin: 0, padding: '0 5mm 4mm 5mm', boxSizing: 'border-box', background: 'white' }}
      >
        <h1
          className="store-logo-font text-center text-base font-bold uppercase tracking-[0.08em]"
          style={{ fontFamily: "'Dolce Vita', 'Space Grotesk', sans-serif" }}
        >
          {businessName}
        </h1>
        {user?.storeReceipt.taxId ? (
          <p className="text-center text-xs">NIT: {user.storeReceipt.taxId}</p>
        ) : null}
        {user?.storeReceipt.address ? (
          <p className="text-center text-xs">{user.storeReceipt.address}</p>
        ) : null}
        {user?.storeReceipt.city ? (
          <p className="text-center text-xs">{user.storeReceipt.city}</p>
        ) : null}

        {expense && (
          <>
            <p className="my-1 border-t border-dashed border-black" />
            <p className="text-center text-xs font-semibold">Comprobante de gasto</p>

            <div className="mt-2 text-xs">
              <p>Fecha: {expense.expense_date}</p>
              {expense.category ? <p>Categoria: {expense.category}</p> : null}
              {expense.notes ? <p>Nota: {expense.notes}</p> : null}
            </div>

            <div className="mt-2 border-t border-dashed border-black pt-2 text-xs">
              <div className="mt-1 flex justify-between gap-2 font-bold">
                <span>Total gasto</span>
                <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{formatCop(expense.amount)}</span>
              </div>
            </div>

            
          </>
        )}
      </div>
    </div>
  )
}
