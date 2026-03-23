import { type DataLabel, getFreshness } from '@/core/types'
import { FreshnessDot } from './FreshnessDot'

interface DataLabelValueProps {
  label: DataLabel<number>
  format?: (value: number) => string
  prefix?: string
  suffix?: string
}

export function DataLabelValue({ label, format, prefix, suffix }: DataLabelValueProps) {
  const freshness = getFreshness(label)
  const formatted = format ? format(label.value) : label.value.toFixed(2)

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`font-mono ${
          freshness === 'expired' ? 'text-text-muted line-through' : 'text-text-primary'
        }`}
      >
        {prefix}{formatted}{suffix}
      </span>
      <FreshnessDot label={label} />
    </div>
  )
}
