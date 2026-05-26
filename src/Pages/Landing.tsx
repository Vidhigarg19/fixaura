import { motion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import { Link } from 'react-router-dom'
import {
  Camera,
  Shield,
  Wrench,
  Zap,
  Star,
  Play,
  ChevronRight,
} from 'lucide-react'
import LanguageToggle from '../components/LanguageToggle'
import ConfidenceMeter from '../components/ConfidenceMeter'
import { t } from '../i18n'

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

const stagger = {
  visible: { transition: { staggerChildren: 0.12 } },
}

function RevealSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode
  className?: string
  id?: string
}) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.15 })
  return (
    <motion.section
      id={id}
      ref={ref}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  )
}

const features = [
  { icon: Camera, key: 'AI vision scan' },
  { icon: Shield, key: 'Safety-first guidance' },
  { icon: Wrench, key: 'Tool checklists' },
  { icon: Zap, key: 'AR step overlays' },
]

const categories = ['Appliances', 'Plumbing', 'Furniture', 'Electronics', 'Outdoor', 'Fixtures']
const testimonials = [
  { name: 'Maya R.', quote: 'Fixed our dryer in one evening — saved a $200 service call.' },
  { name: 'James K.', quote: 'The AR arrows made a scary repair feel manageable.' },
  { name: 'Priya S.', quote: 'Confidence meter told me when to retake the photo. Smart.' },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-text-primary overflow-x-hidden">
      <div className="fixed inset-0 bg-aura-radial pointer-events-none" />
      <div className="fixed inset-0 bg-aura-mesh pointer-events-none opacity-60" />

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-30 glass-panel border-b border-border/80"
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/20 flex items-center justify-center glow-teal">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">FixAura</span>
          </motion.div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-primary transition-colors">
              {t('nav.features')}
            </a>
            <a href="#showcase" className="hover:text-primary transition-colors">
              {t('nav.showcase')}
            </a>
            <a href="#testimonials" className="hover:text-primary transition-colors">
              {t('nav.testimonials')}
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link to="/capture">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-background"
              >
                {t('nav.scan')}
                <ChevronRight className="h-4 w-4" />
              </motion.span>
            </Link>
          </div>
        </div>
      </motion.header>

      <main className="relative">
        <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-24 md:pt-24">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="grid lg:grid-cols-2 gap-12 items-center"
          >
            <div>
              <motion.h1 variants={fadeUp} className="text-display text-text-primary mb-6">
                {t('landing.headline')}
              </motion.h1>
              <motion.p variants={fadeUp} className="text-body-lg text-text-secondary mb-8 max-w-lg">
                {t('landing.subheadline')}
              </motion.p>
              <motion.div variants={fadeUp} className="flex flex-wrap gap-4">
                <Link to="/capture">
                  <motion.span
                    whileHover={{ scale: 1.03, boxShadow: '0 0 32px rgba(0,245,212,0.45)' }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-background"
                  >
                    <Camera className="h-5 w-5" />
                    {t('landing.ctaPrimary')}
                  </motion.span>
                </Link>
                <motion.a
                  href="#preview"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-text-secondary hover:border-primary/40"
                >
                  <Play className="h-5 w-5" />
                  {t('landing.ctaSecondary')}
                </motion.a>
              </motion.div>
            </div>

            <motion.div
              id="preview"
              variants={fadeUp}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="relative"
            >
              <div className="glass-panel rounded-2xl p-6 phone-shadow">
                <div className="aspect-[9/16] max-h-[420px] mx-auto rounded-xl bg-surface-high relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent" />
                  <ARPreviewMock />
                </div>
                <motion.div
                  className="absolute -bottom-4 -left-4 glass-panel rounded-xl p-4 border border-primary/30"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <p className="text-label-bold text-text-subtle mb-2">
                    {t('landing.confidenceLabel')}
                  </p>
                  <ConfidenceMeter value={87} size={100} />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        <RevealSection className="mx-auto max-w-6xl px-4 py-20" id="features">
          <motion.h2 variants={fadeUp} className="text-heading-xl text-center mb-12">
            {t('landing.featuresTitle')}
          </motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map(({ icon: Icon, key }) => (
              <motion.div
                key={key}
                variants={fadeUp}
                whileHover={{ y: -4 }}
                className="glass-panel rounded-xl p-6 feature-card"
              >
                <Icon className="h-8 w-8 text-primary mb-4" />
                <p className="font-semibold">{key}</p>
              </motion.div>
            ))}
          </div>
        </RevealSection>

        <RevealSection id="showcase" className="mx-auto max-w-6xl px-4 py-20">
          <motion.h2 variants={fadeUp} className="text-heading-xl text-center mb-12">
            {t('landing.showcaseTitle')}
          </motion.h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <motion.div
                key={cat}
                variants={fadeUp}
                className="glass-panel rounded-xl p-6 text-center hover:border-primary/30 transition-colors"
              >
                <span className="text-body-md font-medium">{cat}</span>
              </motion.div>
            ))}
          </div>
        </RevealSection>

        <RevealSection id="testimonials" className="mx-auto max-w-6xl px-4 py-20">
          <motion.h2 variants={fadeUp} className="text-heading-xl text-center mb-12">
            {t('landing.testimonialsTitle')}
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((item) => (
              <motion.blockquote
                key={item.name}
                variants={fadeUp}
                className="glass-panel rounded-xl p-6"
              >
                <div className="flex gap-1 text-warning mb-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-warning" />
                  ))}
                </div>
                <p className="text-text-secondary mb-4">&ldquo;{item.quote}&rdquo;</p>
                <cite className="text-sm font-semibold not-italic">{item.name}</cite>
              </motion.blockquote>
            ))}
          </div>
        </RevealSection>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-panel rounded-2xl p-10 text-center border border-primary/20 glow-teal"
          >
            <h2 className="text-heading-lg mb-3">{t('landing.ctaBannerTitle')}</h2>
            <p className="text-text-secondary mb-6">{t('landing.ctaBannerSubtitle')}</p>
            <Link to="/capture">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex rounded-xl bg-primary px-8 py-3 font-semibold text-background"
              >
                {t('landing.ctaPrimary')}
              </motion.span>
            </Link>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-text-subtle text-sm">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            <span>FixAura — {t('landing.footerTagline')}</span>
          </div>
          <p>© {new Date().getFullYear()} FixAura. {t('landing.footerRights')}</p>
        </div>
      </footer>
    </div>
  )
}

function ARPreviewMock() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 360" aria-hidden>
      <rect x="20" y="40" width="160" height="200" rx="8" fill="none" stroke="#00F5D4" strokeWidth="1" opacity="0.5" />
      <path d="M100 120 L100 200 M100 200 L80 180 M100 200 L120 180" stroke="#00F5D4" strokeWidth="2" fill="none" />
      <circle cx="100" cy="100" r="24" fill="none" stroke="#4BDBCB" strokeWidth="1.5" />
    </svg>
  )
}
