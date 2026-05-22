import { lazy } from 'react'

const RETRY_FLAG = 'pos:lazy-retried'

function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('chunkloaderror')
  )
}

export function lazyWithRetry<T extends { default: React.ComponentType<any> }>(
  importer: () => Promise<T>,
) {
  return lazy(async () => {
    try {
      const loaded = await importer()
      sessionStorage.removeItem(RETRY_FLAG)
      return loaded
    } catch (error) {
      const retried = sessionStorage.getItem(RETRY_FLAG) === '1'
      if (!retried && isChunkLoadError(error)) {
        sessionStorage.setItem(RETRY_FLAG, '1')
        window.location.reload()
      }
      throw error
    }
  })
}
