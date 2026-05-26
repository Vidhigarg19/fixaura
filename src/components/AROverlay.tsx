import { motion } from 'framer-motion'

interface AROverlayProps {
  variant?: 'capture' | 'guide'
  visualCue?: 'arrow' | 'box' | 'circle' | 'line'
}

export default function AROverlay({
  variant = 'capture',
  visualCue = 'box',
}: AROverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      {/* Corner brackets */}
      {[
        'top-8 left-8',
        'top-8 right-8 scale-x-[-1]',
        'bottom-24 left-8 scale-y-[-1]',
        'bottom-24 right-8 scale-[-1]',
      ].map((pos) => (
        <motion.div
          key={pos}
          className={`absolute ${pos} w-12 h-12`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <svg viewBox="0 0 48 48" className="w-full h-full">
            <motion.path
              d="M4 44 L4 4 L44 4"
              fill="none"
              stroke="#00F5D4"
              strokeWidth="2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{ filter: 'drop-shadow(0 0 6px rgba(0,245,212,0.6))' }}
            />
          </svg>
        </motion.div>
      ))}

      {variant === 'capture' && (
        <motion.div
          className="absolute inset-12 border border-primary/30 rounded-xl"
          animate={{ boxShadow: ['0 0 12px rgba(0,245,212,0.2)', '0 0 24px rgba(0,245,212,0.45)', '0 0 12px rgba(0,245,212,0.2)'] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      )}

      {variant === 'guide' && visualCue === 'arrow' && (
        <motion.svg
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-24 h-24"
          viewBox="0 0 100 100"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.path
            d="M50 10 L50 70 M50 70 L30 50 M50 70 L70 50"
            fill="none"
            stroke="#00F5D4"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6 }}
          />
        </motion.svg>
      )}

      {variant === 'guide' && visualCue === 'circle' && (
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-2 border-primary"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ boxShadow: '0 0 20px rgba(0,245,212,0.4)' }}
        />
      )}

      {variant === 'guide' && visualCue === 'line' && (
        <motion.div
          className="absolute top-1/2 left-8 right-8 h-0.5 bg-primary"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          style={{ originX: 0, boxShadow: '0 0 12px rgba(0,245,212,0.5)' }}
        />
      )}
    </div>
  )
}
