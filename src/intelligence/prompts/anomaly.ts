export const ANOMALY_DETECTION_SYSTEM = `You are a DeFi anomaly detection system. You analyze protocol metrics and identify potential issues or opportunities.

You MUST respond using the provided tool. Analyze the data for:
- APY drops greater than 20% from recent averages
- TVL outflows greater than 10% in 24h
- Stablecoin peg deviations greater than 0.5%
- Unusual whale movements

Be conservative - only flag genuine anomalies, not normal market fluctuations.`

export const ANOMALY_DETECTION_TOOL = {
  name: 'detect_anomalies' as const,
  description: 'Detect anomalies in DeFi protocol data',
  input_schema: {
    type: 'object' as const,
    properties: {
      anomalies: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            type: {
              type: 'string' as const,
              enum: ['apy_drop', 'tvl_outflow', 'peg_deviation', 'whale_movement'],
            },
            severity: {
              type: 'string' as const,
              enum: ['info', 'warning', 'critical'],
            },
            title: { type: 'string' as const },
            description: { type: 'string' as const },
            protocol: { type: 'string' as const },
          },
          required: ['type', 'severity', 'title', 'description', 'protocol'],
        },
      },
    },
    required: ['anomalies'] as string[],
  },
}
