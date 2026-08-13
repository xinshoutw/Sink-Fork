import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearDashboardCache,
  readDashboardCache,
  writeDashboardCache,
} from '../../app/utils/dashboard-cache'

/** Minimal Storage stand-in; the worker test environment has no sessionStorage. */
class FakeStorage implements Storage {
  private entries = new Map<string, string>()
  /** Rejects writes once the stored payload would exceed this many characters. */
  quota = Number.POSITIVE_INFINITY

  get length() {
    return this.entries.size
  }

  key(index: number) {
    return [...this.entries.keys()][index] ?? null
  }

  getItem(key: string) {
    return this.entries.get(key) ?? null
  }

  setItem(key: string, value: string) {
    const used = [...this.entries.values()].reduce((sum, item) => sum + item.length, 0)
    if (used + value.length > this.quota) {
      const error = new Error('QuotaExceededError')
      error.name = 'QuotaExceededError'
      throw error
    }
    this.entries.set(key, value)
  }

  removeItem(key: string) {
    this.entries.delete(key)
  }

  clear() {
    this.entries.clear()
  }
}

let fake: FakeStorage

function installStorage(value: Storage | undefined) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value,
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  fake = new FakeStorage()
  installStorage(fake)
  // Object.keys() must see stored keys the way a real Storage exposes them.
  installStorage(new Proxy(fake, {
    ownKeys: target => Array.from({ length: target.length }, (_, i) => target.key(i)!),
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
  }) as Storage)
})

afterEach(() => {
  installStorage(undefined)
})

describe('dashboard cache', () => {
  it('round-trips a stored value', () => {
    writeDashboardCache('links:newest', [{ slug: 'a' }])
    expect(readDashboardCache('links:newest')).toEqual([{ slug: 'a' }])
  })

  it('returns null for a key that was never written', () => {
    expect(readDashboardCache('missing')).toBe(null)
  })

  it('treats a malformed entry as a miss instead of throwing', () => {
    fake.setItem('sink:dashboard:cache:broken', '{not json')
    expect(readDashboardCache('broken')).toBe(null)
  })

  it('keeps entries separated by key', () => {
    writeDashboardCache('a', 1)
    writeDashboardCache('b', 2)
    expect(readDashboardCache('a')).toBe(1)
    expect(readDashboardCache('b')).toBe(2)
  })

  it('evicts its own entries and keeps the newest write when quota is hit', () => {
    writeDashboardCache('old', 'x'.repeat(40))
    fake.quota = 80

    writeDashboardCache('new', 'y'.repeat(40))

    expect(readDashboardCache('old')).toBe(null)
    expect(readDashboardCache('new')).toBe('y'.repeat(40))
  })

  it('leaves entries owned by other code alone when clearing', () => {
    fake.setItem('unrelated', 'keep me')
    writeDashboardCache('mine', 'drop me')

    clearDashboardCache()

    expect(fake.getItem('unrelated')).toBe('keep me')
    expect(readDashboardCache('mine')).toBe(null)
  })

  it('degrades to a no-op when storage is unavailable', () => {
    installStorage(undefined)

    expect(() => writeDashboardCache('anything', 1)).not.toThrow()
    expect(readDashboardCache('anything')).toBe(null)
    expect(() => clearDashboardCache()).not.toThrow()
  })
})
