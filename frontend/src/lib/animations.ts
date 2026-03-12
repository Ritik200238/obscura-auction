import type { Variants, Transition } from 'framer-motion'

/** Custom easing: fast start, smooth deceleration — premium feel */
export const smoothEase = [0.22, 1, 0.36, 1] as const

/** Spring config for interactive elements */
const springTransition: Transition = {
  type: 'spring',
  bounce: 0.3,
  duration: 0.8,
}

/** Fade in from below — primary entrance animation */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: smoothEase },
  },
}

/** Scale from 0.95 with opacity — for modals, panels, cards */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springTransition,
  },
}

/** Slide in from left — for sidebar items, list entries */
export const slideIn: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, ease: smoothEase },
  },
}

/** Container that staggers children — wrap around a list of motion.div */
export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
}

/** Full page transition variants */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: smoothEase },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2 },
  },
}

/** Card hover interaction — use with whileHover */
export const cardHover = {
  scale: 1.02,
  transition: { type: 'spring', stiffness: 400, damping: 25 },
}

/** Subtle float animation for decorative elements */
export const floatVariants: Variants = {
  animate: {
    y: [0, -8, 0],
    transition: {
      duration: 6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}
