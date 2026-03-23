import type { Adapter } from '@/core/adapter'

class AdapterRegistry {
  private adapters = new Map<string, Adapter>()

  register(adapter: Adapter): void {
    this.adapters.set(adapter.config.name, adapter)
    console.log(`[registry] Registered adapter: ${adapter.config.name}`)
  }

  get(name: string): Adapter | undefined {
    return this.adapters.get(name)
  }

  getAll(): Adapter[] {
    return Array.from(this.adapters.values())
  }

  getByCapability(capability: 'read' | 'write' | 'historical' | 'realtime'): Adapter[] {
    return this.getAll().filter((a) => a.config.capabilities[capability])
  }

  async initializeAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.getAll().map(async (adapter) => {
        const available = await adapter.isAvailable()
        if (available) {
          await adapter.initialize()
          console.log(`[registry] Initialized: ${adapter.config.name}`)
        } else {
          console.warn(`[registry] Not available: ${adapter.config.name}`)
        }
      })
    )
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length) {
      console.error(`[registry] ${failed.length} adapters failed to initialize`)
    }
  }
}

export const adapterRegistry = new AdapterRegistry()
