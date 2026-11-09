import { motion } from 'framer-motion'

// Viewfinder framing for the LIVE camera preview on the capture screen only. It is never
// drawn over a captured photo: the repair guide shows the user's photo clean.
export default function AROverlay() {
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

      <motion.div
        className="absolute inset-12 border border-primary/30 rounded-xl"
        animate={{ boxShadow: ['0 0 12px rgba(0,245,212,0.2)', '0 0 24px rgba(0,245,212,0.45)', '0 0 12px rgba(0,245,212,0.2)'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </div>
  )
}
