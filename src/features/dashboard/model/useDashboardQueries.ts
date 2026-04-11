import { useQuery } from '@tanstack/react-query'
import { getDashboardKpis } from '../services/dashboardService'

export function useDashboardKpisQuery(storeId?: string) {
  return useQuery({
    queryKey: ['dashboard', 'kpis', storeId],
    queryFn: () => getDashboardKpis(storeId as string),
    enabled: Boolean(storeId),
  })
}
