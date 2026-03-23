export interface AdapterCapability {
  read: boolean
  write: boolean
  historical: boolean
  realtime: boolean
}

export interface AdapterConfig {
  name: string
  capabilities: AdapterCapability
  pollInterval: number // ms
  priority: number // higher = preferred
}

export interface Adapter {
  config: AdapterConfig
  initialize(): Promise<void>
  isAvailable(): Promise<boolean>
  // Adapters return DataLabel-wrapped values
}
