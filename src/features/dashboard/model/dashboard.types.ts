export interface DashboardTopProduct {
  name: string
  quantity: number
  revenue: number
}

export interface DashboardSellerMetric {
  sellerId: string
  sellerName: string
  totalSales: number
  revenue: number
}

export interface DashboardKpis {
  salesToday: number
  salesMonth: number
  averageTicket: number
  outOfStockCount: number
  lowRotationCount: number
  topProducts: DashboardTopProduct[]
  salesBySeller: DashboardSellerMetric[]
}
