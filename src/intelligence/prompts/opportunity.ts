export const OPPORTUNITY_SYSTEM = `You are a DeFi opportunity scanner. You analyze yield sources and identify opportunities for the user based on their current positions.

You MUST respond using the provided tool. Focus on:
- APY improvements with similar or lower risk
- New strategies that match the user's risk profile
- Timing opportunities from utilization rate changes
- Diversification suggestions

Be specific about why each opportunity exists and what the trade-offs are.`

export const OPPORTUNITY_TOOL = {
  name: 'surface_opportunities' as const,
  description: 'Identify yield opportunities for the user',
  input_schema: {
    type: 'object' as const,
    properties: {
      opportunities: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            protocol: { type: 'string' as const },
            strategy: { type: 'string' as const },
            currentApy: { type: 'number' as const },
            projectedGain: { type: 'number' as const, description: 'Annual USD gain vs current position' },
            riskLevel: { type: 'string' as const },
            reason: { type: 'string' as const },
          },
          required: ['protocol', 'strategy', 'currentApy', 'projectedGain', 'riskLevel', 'reason'],
        },
      },
    },
    required: ['opportunities'] as string[],
  },
}
