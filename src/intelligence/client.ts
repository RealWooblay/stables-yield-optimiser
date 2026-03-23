import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('VITE_ANTHROPIC_API_KEY not set')
    }
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
  }
  return client
}

export function isIntelligenceAvailable(): boolean {
  return !!import.meta.env.VITE_ANTHROPIC_API_KEY
}
