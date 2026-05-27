import React from "react";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { Link } from "react-router-dom";
import {
  Camera,
  Shield,
  Wrench,
  Zap,
  Star,
  Play,
  ChevronRight,
  BadgeCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Droplets,
  Fan,
  Refrigerator,
  MonitorSmartphone,
  Sofa,
  GlassWater,
} from "lucide-react";
import LanguageToggle from "../components/LanguageToggle";
import ConfidenceMeter from "../components/ConfidenceMeter";
import { t } from "../i18n";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.06 } },
};

const cardStagger = {
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
};

function RevealSection({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.15 });

  return (
    <motion.section
      id={id}
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const features = [
  {
    icon: Camera,
    titleKey: "landing.feature.aiVisionScan.title",
    descriptionKey: "landing.feature.aiVisionScan.description",
  },
  {
    icon: Shield,
    titleKey: "landing.feature.safetyGuidance.title",
    descriptionKey: "landing.feature.safetyGuidance.description",
  },
  {
    icon: Wrench,
    titleKey: "landing.feature.toolChecklists.title",
    descriptionKey: "landing.feature.toolChecklists.description",
  },
  {
    icon: Zap,
    titleKey: "landing.feature.arStepOverlays.title",
    descriptionKey: "landing.feature.arStepOverlays.description",
  },
];

const categories = [
  { nameKey: "landing.category.appliances", icon: Refrigerator, tone: "from-cyan-400/20 to-teal-400/10" },
  { nameKey: "landing.category.plumbing", icon: Droplets, tone: "from-sky-400/20 to-cyan-400/10" },
  { nameKey: "landing.category.furniture", icon: Sofa, tone: "from-emerald-400/20 to-teal-400/10" },
  { nameKey: "landing.category.electronics", icon: MonitorSmartphone, tone: "from-violet-400/20 to-fuchsia-400/10" },
  { nameKey: "landing.category.outdoor", icon: Fan, tone: "from-lime-400/20 to-emerald-400/10" },
  { nameKey: "landing.category.fixtures", icon: GlassWater, tone: "from-amber-400/20 to-orange-400/10" },
];

const testimonials = [
  {
    nameKey: "landing.testimonials.maya.name",
    roleKey: "landing.testimonials.maya.role",
    quoteKey: "landing.testimonials.maya.quote",
  },
  {
    nameKey: "landing.testimonials.james.name",
    roleKey: "landing.testimonials.james.role",
    quoteKey: "landing.testimonials.james.quote",
  },
  {
    nameKey: "landing.testimonials.priya.name",
    roleKey: "landing.testimonials.priya.role",
    quoteKey: "landing.testimonials.priya.quote",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-text-primary overflow-x-hidden relative">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(0,245,212,0.18),transparent_34%),radial-gradient(circle_at_80%_85%,rgba(75,219,203,0.10),transparent_28%),linear-gradient(to_bottom,#041329_0%,#03101f_100%)]" />
      <div className="fixed inset-0 pointer-events-none opacity-40 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(0,245,212,0.10)_0%,transparent_50%)] blur-3xl" />

      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 glass-panel border-b border-border/80 backdrop-blur-xl"
      >
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 md:px-6 lg:px-8 py-4">
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <div className="h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center shadow-[0_0_24px_rgba(0,245,212,0.24)]">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div className="leading-none">
              <span className="block font-bold text-[18px] tracking-tight text-text-primary">
                {t("common.brandName")}
              </span>
              <span className="block text-[11px] uppercase tracking-[0.26em] text-text-subtle mt-1">
                {t("landing.footerTagline")}
              </span>
            </div>
          </motion.div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-primary transition-colors">
              {t("nav.features")}
            </a>
            <a href="#showcase" className="hover:text-primary transition-colors">
              {t("nav.showcase")}
            </a>
            <a href="#testimonials" className="hover:text-primary transition-colors">
              {t("nav.testimonials")}
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            <Link to="/capture">
              <motion.span
                whileHover={{ scale: 1.03, boxShadow: "0 0 32px rgba(0,245,212,0.45)" }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-background shadow-[0_12px_30px_rgba(0,245,212,0.22)]"
              >
                {t("nav.scan")}
                <ChevronRight className="h-4 w-4" />
              </motion.span>
            </Link>
          </div>
        </div>
      </motion.header>

      <main className="relative">
        <section className="relative mx-auto max-w-6xl px-4 md:px-6 lg:px-8 pt-14 md:pt-20 pb-20 md:pb-28 min-h-[calc(100vh-88px)] flex items-center">
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center w-full"
          >
            <div className="relative z-10">
              <motion.div
                variants={fadeUp}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/8 text-primary text-[12px] font-semibold tracking-[0.18em] uppercase mb-6 shadow-[0_0_24px_rgba(0,245,212,0.12)]"
              >
                <BadgeCheck className="h-4 w-4" />
                {t("landing.badge")}
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-[42px] md:text-[64px] lg:text-[72px] leading-[0.98] tracking-[-0.03em] font-extrabold text-text-primary max-w-[11ch]"
              >
                <span className="block">{t("landing.heroLine1")}</span>
                <span className="block text-primary">{t("landing.heroLine2")}</span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="mt-6 text-[16px] md:text-[18px] leading-[1.7] text-text-secondary max-w-[38rem]"
              >
                {t("landing.subheadline")}
              </motion.p>

              <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-4">
                <Link to="/capture">
                  <motion.span
                    whileHover={{ scale: 1.03, boxShadow: "0 0 34px rgba(0,245,212,0.42)" }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-background shadow-[0_18px_42px_rgba(0,245,212,0.18)]"
                  >
                    <Camera className="h-5 w-5" />
                    {t("landing.ctaPrimary")}
                  </motion.span>
                </Link>

                <motion.a
                  href="#preview"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 rounded-full border border-border-default/90 bg-white/0 px-6 py-3.5 font-semibold text-text-secondary hover:text-text-primary hover:border-primary/40 transition-colors"
                >
                  <Play className="h-5 w-5" />
                  {t("landing.ctaSecondary")}
                </motion.a>
              </motion.div>

              <motion.div variants={fadeUp} className="mt-8 flex items-center gap-4 text-sm text-text-subtle">
                <div className="flex -space-x-2">
                  {["A", "M", "P", "J"].map((letter) => (
                    <div
                      key={letter}
                      className="h-9 w-9 rounded-full border border-border-default bg-brand-surface flex items-center justify-center text-[12px] font-semibold text-text-primary shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
                    >
                      {letter}
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-text-primary font-semibold">{t("landing.trustStat")}</p>
                  <p className="text-text-subtle">{t("landing.trustSubtitle")}</p>
                </div>
              </motion.div>
            </div>

            <motion.div
              id="preview"
              variants={fadeUp}
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
              className="relative flex justify-center lg:justify-end"
            >
              <div className="relative w-full max-w-[430px]">
                <div className="absolute -inset-8 bg-[radial-gradient(circle_at_center,rgba(0,245,212,0.20),transparent_62%)] blur-3xl" />
                <div className="glass-panel rounded-[2rem] p-5 md:p-6 border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.36)] relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 to-transparent" />
                  <div className="aspect-[9/16] max-h-[540px] mx-auto rounded-[1.5rem] bg-[#08182c] relative overflow-hidden border border-white/5">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,245,212,0.14),transparent_34%)]" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#04101f]/65" />
                    <img
                      alt={t("landing.preview.alt")}
                      className="absolute inset-0 w-full h-full object-cover opacity-88"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAzkx241-OG9bs7JVkdeP8sKDiMiw6RPKYI29l4oYQ6R6f3-5gxj8rNnCWMMohWMbT0fhGNFbKKZch0qVWSPvKJfS8A-SOQIq7-4MS8rTLxJxi0Xi1bLWpo-heldzx0Zvr_FgdOoBHopqVZ_7PuTN7GDfww6cGPiKjbvBk4AJN5QIQZwcDYR_V-17Zca0LHbtUTijn6Irzfv3HkifsGmD8PA89GF0z6rVuw8DjLmPKUeNS7-KYBwU2Ue972MEnNWYdeO7fvmFuC"
                    />
                    <div className="absolute inset-0">
                      <div className="absolute top-[16%] left-[16%] h-[42%] w-[48%] rounded-2xl border border-primary/60 shadow-[0_0_26px_rgba(0,245,212,0.20)]" />
                      <div className="absolute top-[19%] right-[18%] h-10 w-10 rounded-full border border-secondary/70 bg-primary/10 animate-pulse" />
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.4, duration: 0.45 }}
                        className="absolute top-8 left-6 right-6 glass-panel rounded-2xl p-4 border border-white/10"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12px] uppercase tracking-[0.22em] text-primary font-semibold">
                            {t("landing.preview.diagnosisTitle")}
                          </span>
                          <span className="text-[12px] font-semibold text-secondary">
                            {t("landing.preview.confidenceText")}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[15px] font-semibold text-text-primary">
                              {t("landing.preview.issueName")}
                            </p>
                            <p className="text-[13px] text-text-subtle mt-1">
                              {t("landing.preview.safetyLine")}
                            </p>
                          </div>
                          <CheckCircle2 className="h-6 w-6 text-secondary shrink-0" />
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6, duration: 0.45 }}
                        className="absolute bottom-8 left-5 glass-panel rounded-2xl px-4 py-3 border border-white/10"
                      >
                        <p className="text-[11px] uppercase tracking-[0.22em] text-text-subtle">
                          {t("landing.preview.liveScanLabel")}
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span className="text-[13px] text-text-primary font-medium">
                            {t("landing.preview.arOverlayLockedLine")}
                          </span>
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8, duration: 0.45 }}
                        className="absolute -bottom-6 -right-5 glass-panel rounded-2xl p-4 border border-primary/20 shadow-[0_0_40px_rgba(0,245,212,0.12)]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <ConfidenceMeter value={89} size={92} />
                          </div>
                          <div>
                            <p className="text-[12px] uppercase tracking-[0.2em] text-text-subtle">
                              {t("landing.preview.confidenceLabel")}
                            </p>
                            <p className="text-[14px] font-semibold text-text-primary mt-1">
                              {t("landing.preview.confidenceValue")}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>

                <div className="absolute -top-6 -right-3 h-20 w-20 rounded-full border border-primary/15 bg-primary/5 animate-[spin_22s_linear_infinite]" />
                <div className="absolute -bottom-8 -left-4 h-28 w-28 rounded-full border-2 border-primary/10 bg-transparent animate-[spin_28s_linear_infinite_reverse]" />
              </div>
            </motion.div>
          </motion.div>
        </section>

        <RevealSection className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-20" id="features">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <p className="text-[12px] uppercase tracking-[0.26em] text-primary font-semibold mb-3">
              {t("landing.featuresKicker")}
            </p>
            <h2 className="text-[30px] md:text-[40px] font-bold tracking-[-0.02em] text-text-primary">
              {t("landing.featuresTitle")}
            </h2>
            <div className="w-24 h-1 bg-primary mx-auto rounded-full mt-5 shadow-[0_0_16px_rgba(0,245,212,0.28)]" />
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map(({ icon: Icon, titleKey, descriptionKey }) => (
              <motion.div
                key={titleKey}
                variants={fadeUp}
                whileHover={{ y: -6 }}
                className="glass-panel rounded-[1.5rem] p-6 border border-white/10 hover:border-primary/30 transition-colors group"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 border border-primary/15">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-[18px] font-semibold text-text-primary mb-3">{t(titleKey)}</h3>
                <p className="text-[15px] leading-[1.65] text-text-secondary">
                  {t(descriptionKey)}
                </p>
              </motion.div>
            ))}
          </div>
        </RevealSection>

        <RevealSection id="showcase" className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-20">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <p className="text-[12px] uppercase tracking-[0.26em] text-primary font-semibold mb-3">
              {t("landing.showcaseKicker")}
            </p>
            <h2 className="text-[30px] md:text-[40px] font-bold tracking-[-0.02em] text-text-primary">
              {t("landing.showcaseTitle")}
            </h2>
          </motion.div>

          <motion.div
            variants={cardStagger}
            className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-5"
          >
            {categories.map(({ nameKey, icon: Icon, tone }) => (
              <motion.div
                key={nameKey}
                variants={fadeUp}
                whileHover={{ y: -6, scale: 1.01 }}
                className={`glass-panel rounded-[1.5rem] p-5 md:p-6 text-center border border-white/10 bg-gradient-to-br ${tone} hover:border-primary/25 transition-colors cursor-pointer`}
              >
                <div className="mx-auto h-14 w-14 md:h-16 md:w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/10">
                  <Icon className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                </div>
                <span className="text-[15px] md:text-[16px] font-semibold text-text-primary">
                  {t(nameKey)}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </RevealSection>

        <RevealSection id="testimonials" className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-20">
          <motion.div variants={fadeUp} className="text-center mb-12">
            <p className="text-[12px] uppercase tracking-[0.26em] text-primary font-semibold mb-3">
              {t("landing.testimonialsKicker")}
            </p>
            <h2 className="text-[30px] md:text-[40px] font-bold tracking-[-0.02em] text-text-primary">
              {t("landing.testimonialsTitle")}
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((item) => (
              <motion.blockquote
                key={item.nameKey}
                variants={fadeUp}
                whileHover={{ y: -5 }}
                className="glass-panel rounded-[1.5rem] p-6 border border-white/10 relative overflow-hidden"
              >
                <div className="absolute top-4 right-4 text-primary/10">
                  <Star className="h-14 w-14 fill-current" />
                </div>
                <div className="flex text-primary mb-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="text-[15px] leading-[1.7] text-text-secondary mb-5">
                  “{t(item.quoteKey)}”
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 border border-primary/15 flex items-center justify-center">
                    <span className="text-primary font-semibold text-[13px]">
                      {t(item.nameKey)
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                  </div>
                  <div>
                    <cite className="block text-[14px] font-semibold not-italic text-text-primary">
                      {t(item.nameKey)}
                    </cite>
                    <span className="block text-[12px] uppercase tracking-[0.16em] text-text-subtle mt-1">
                      {t(item.roleKey)}
                    </span>
                  </div>
                </div>
              </motion.blockquote>
            ))}
          </div>
        </RevealSection>

        <section className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 py-8 md:py-12">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-[linear-gradient(135deg,rgba(0,245,212,0.14),rgba(75,219,203,0.10),rgba(4,19,41,0.92))] p-8 md:p-12 text-center shadow-[0_0_60px_rgba(0,245,212,0.10)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18)_0%,transparent_58%)] opacity-70" />
            <div className="relative z-10">
              <p className="text-[12px] uppercase tracking-[0.26em] text-primary font-semibold mb-4">
                {t("landing.ctaBannerKicker")}
              </p>
              <h2 className="text-[32px] md:text-[56px] font-extrabold tracking-[-0.03em] text-text-primary">
                {t("landing.ctaBannerTitle")}
              </h2>
              <p className="mt-5 text-[16px] md:text-[18px] leading-[1.7] text-text-secondary max-w-2xl mx-auto">
                {t("landing.ctaBannerSubtitle")}
              </p>

              <Link to="/capture">
                <motion.span
                  whileHover={{ scale: 1.04, boxShadow: "0 0 32px rgba(0,245,212,0.46)" }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 mt-8 rounded-full bg-primary px-8 py-3.5 font-semibold text-background shadow-[0_18px_42px_rgba(0,245,212,0.18)]"
                >
                  {t("landing.ctaPrimary")}
                  <ArrowRight className="h-5 w-5" />
                </motion.span>
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/8 mt-6 py-10 md:py-12 bg-[#03101f]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8 grid gap-10 md:grid-cols-4 text-sm">
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="block text-[18px] font-bold text-text-primary">{t("common.brandName")}</span>
                <span className="block text-[11px] uppercase tracking-[0.22em] text-text-subtle mt-1">
                  {t("landing.footerSurgicalTagline")}
                </span>
              </div>
            </div>
            <p className="text-text-secondary leading-[1.7] max-w-xs">
              {t("landing.footerDescription")}
            </p>
          </div>

          <div>
            <h4 className="text-[13px] uppercase tracking-[0.22em] text-text-primary font-semibold mb-4">
              {t("landing.footerProductHeading")}
            </h4>
            <ul className="space-y-3 text-text-secondary">
              <li>
                <a className="hover:text-primary transition-colors" href="#features">
                  {t("landing.footerProductFeatures")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#showcase">
                  {t("landing.footerProductProMode")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#features">
                  {t("landing.footerProductSafetyFirst")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#testimonials">
                  {t("landing.footerProductStatus")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[13px] uppercase tracking-[0.22em] text-text-primary font-semibold mb-4">
              {t("landing.footerLegalHeading")}
            </h4>
            <ul className="space-y-3 text-text-secondary">
              <li>
                <a className="hover:text-primary transition-colors" href="#">
                  {t("landing.footerLegalPrivacyPolicy")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#">
                  {t("landing.footerLegalTermsOfService")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#">
                  {t("landing.footerLegalCookiePolicy")}
                </a>
              </li>
              <li>
                <a className="hover:text-primary transition-colors" href="#">
                  {t("landing.footerLegalSafetyDisclosure")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <div className="glass-panel p-5 rounded-[1.25rem] border border-white/10">
              <h4 className="text-[13px] uppercase tracking-[0.22em] text-text-primary font-semibold mb-3">
                {t("landing.footerNewsletterHeading")}
              </h4>
              <p className="text-text-secondary mb-4 leading-[1.65]">
                {t("landing.footerNewsletterBody")}
              </p>
              <div className="flex flex-col gap-3">
                <input
                  className="h-12 rounded-xl bg-brand-surface/80 border border-border-default px-4 text-text-primary placeholder:text-text-subtle focus:outline-none focus:border-primary/70 transition-colors"
                  placeholder={t("landing.footerNewsletterPlaceholderEmail")}
                  type="email"
                />
                <button className="h-12 rounded-xl bg-primary text-background font-semibold hover:opacity-90 transition-opacity">
                  {t("landing.footerNewsletterSubscribeButton")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}