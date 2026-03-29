/** Premium easing — transform/opacity only for performance */
export const ease = [0.25, 0.8, 0.25, 1] as const;

export const fast = {
  duration: 0.15,
  ease,
};

export const normal = {
  duration: 0.25,
  ease,
};

export const slow = {
  duration: 0.3,
  ease,
};

/** Staggered children (cards, chart blocks) */
export const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: normal },
};
