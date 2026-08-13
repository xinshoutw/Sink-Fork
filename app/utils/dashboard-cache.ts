const PREFIX = 'sink:dashboard:cache:'

/**
 * Session-scoped cache for dashboard reads.
 *
 * Views hydrate from it so switching folders or pages paints immediately, then
 * replace it with the response once it lands. sessionStorage keeps entries per
 * tab, so nothing outlives the session that fetched it and cached responses
 * never leak between accounts on a shared machine.
 */
function storage(): Storage | null {
  try {
    // Read off globalThis rather than window: absent on the server, and merely
    // accessing it throws outright when storage is blocked by browser settings.
    return globalThis.sessionStorage ?? null
  }
  catch {
    return null
  }
}

export function readDashboardCache<T>(key: string): T | null {
  const store = storage()
  if (!store)
    return null

  try {
    const raw = store.getItem(PREFIX + key)
    return raw ? JSON.parse(raw) as T : null
  }
  catch {
    // Malformed or unreadable entries are treated as a cache miss.
    return null
  }
}

export function writeDashboardCache(key: string, value: unknown): void {
  const store = storage()
  if (!store)
    return

  const payload = JSON.stringify(value)
  try {
    store.setItem(PREFIX + key, payload)
  }
  catch {
    // Out of quota. Drop everything we own and keep only the newest entry;
    // the cache is an optimisation, so failing to store is not an error.
    clearDashboardCache()
    try {
      store.setItem(PREFIX + key, payload)
    }
    catch {}
  }
}

export function clearDashboardCache(): void {
  const store = storage()
  if (!store)
    return

  try {
    for (const key of Object.keys(store)) {
      if (key.startsWith(PREFIX))
        store.removeItem(key)
    }
  }
  catch {}
}
