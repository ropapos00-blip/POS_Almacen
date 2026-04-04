const STORE_NAME_STORAGE_KEY = 'pos.storeName'

export function getCachedStoreName() {
  if (typeof window === 'undefined') {
    return null
  }

  const value = window.localStorage.getItem(STORE_NAME_STORAGE_KEY)
  return value && value.trim().length > 0 ? value : null
}

export function cacheStoreName(storeName: string) {
  if (typeof window === 'undefined') {
    return
  }

  const normalized = storeName.trim()
  if (!normalized) {
    return
  }

  window.localStorage.setItem(STORE_NAME_STORAGE_KEY, normalized)
}
