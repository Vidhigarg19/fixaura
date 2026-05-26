import { motion } from 'framer-motion'

interface StepTimelineProps {
  total: number
  current: number
}

export default function StepTimeline({ total, current }: StepTimelineProps) {
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0

  return (
    <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
      <div className="flex items-center gap-2 mb-2 overflow-x-auto no-scrollbar">
        {Array.from({ length: total }).map((_, i) => (
          <motion.div
            key={i}
            className={`h-2 rounded-full shrink-0 transition-all ${
              i < current
                ? 'w-8 bg-success'
                : i === current
                  ? 'w-10 bg-primary glow-teal'
                  : 'w-6 bg-border'
            }`}
            animate={i === current ? { scale: [1, 1.08, 1] } : {}}
            transition={{ duration: 1.5, repeat: i === current ? Infinity : 0 }}
          />
        ))}
      </div>
      <div className="h-1 rounded-full bg-surface-high overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary-secondary to-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
