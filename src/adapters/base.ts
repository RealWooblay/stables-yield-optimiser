import type { Adapter, AdapterConfig, AdapterCapability } from '@/core/adapter'

export abstract class BaseAdapter implements Adapter {
  abstract config: AdapterConfig

  abstract initialize(): Promise<void>
  abstract isAvailable(): Promise<boolean>

  protected log(message: string): void {
    console.log(`[${this.config.name}] ${message}`)
  }

  protected error(message: string, err?: unknown): void {
    console.error(`[${this.config.name}] ${message}`, err)
  }
}

export function createAdapterConfig(
  name: string,
  capabilities: Partial<AdapterCapability> = {},
  pollInterval = 30_000,
  priority = 0
): AdapterConfig {
  return {
    name,
    capabilities: {
      read: true,
      write: false,
      historical: false,
      realtime: false,
      ...capabilities,
    },
    pollInterval,
    priority,
  }
}
