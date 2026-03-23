export const YIELD_STORY_SYSTEM = `You are a DeFi yield intelligence analyst. You analyze a user's yield-bearing positions and generate structured insights.

You MUST respond using the provided tool. Never respond with plain text.

Key principles:
- Be precise with numbers
- Highlight risks alongside yields
- Compare to alternatives when available
- Use clear, non-technical language where possible
- Focus on actionable insights`

export const YIELD_STORY_TOOL = {
  name: 'generate_yield_story' as const,
  description: 'Generate a structured yield narrative for the user',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string' as const,
        description: 'A 2-3 sentence overview of the user\'s yield position',
      },
      totalEarnings: {
        type: 'number' as const,
        description: 'Estimated total annual earnings in USD',
      },
      topSource: {
        type: 'string' as const,
        description: 'The highest-yielding source description',
      },
      riskAssessment: {
        type: 'string' as const,
        description: 'Overall risk assessment in 1-2 sentences',
      },
      recommendations: {
        type: 'array' as const,
        items: { type: 'string' as const },
        description: 'List of 2-4 actionable recommendations',
      },
    },
    required: ['summary', 'totalEarnings', 'topSource', 'riskAssessment', 'recommendations'] as string[],
  },
}
