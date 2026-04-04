import { useQuery } from '@tanstack/react-query'
import { listPriceCheckVariants } from '../services/priceCheckService'

export function usePriceCheckVariantsQuery(storeId?: string) {
  return useQuery({
    queryKey: ['price-check', 'variants', storeId],
    queryFn: () => listPriceCheckVariants(storeId as string),
    enabled: Boolean(storeId),
  })
}
