"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";

/**
 * App-wide cinematic transition: a crimson-to-black curtain closes, the route changes
 * client-side (so the click's user activation still allows audio autoplay), then it opens.
 */
const Ctx = createContext<(href: string, label?: string) => void>(() => {});

export function useCinematicNavigate() {
  return useContext(Ctx);
}

export function CinematicTransitionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [label, setLabel] = useState<string | null>(null);

  const go = useCallback(
    (href: string, l = "") => {
      setLabel(l);
      window.setTimeout(() => {
        router.push(href);
        window.setTimeout(() => setLabel(null), 650);
      }, 700);
    },
    [router],
  );

  return (
    <Ctx.Provider value={go}>
      {children}
      <AnimatePresence>
        {label !== null && (
          <motion.div
            key="curtain"
            className="fixed inset-0 z-[100] flex items-center justify-center"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } }}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-b from-blood via-[#2a0306] to-ink"
              initial={{ clipPath: "circle(0% at 50% 55%)" }}
              animate={{ clipPath: "circle(150% at 50% 55%)" }}
              transition={{ duration: 0.75, ease: [0.7, 0, 0.3, 1] }}
            />
            <motion.div
              className="absolute inset-0 bg-ink"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.45 }}
            />
            {label && (
              <motion.p
                className="relative font-display text-3xl tracking-[0.5em] text-silver/80 sm:text-4xl"
                initial={{ opacity: 0, letterSpacing: "0.9em" }}
                animate={{ opacity: 1, letterSpacing: "0.5em" }}
                transition={{ delay: 0.3, duration: 0.9 }}
              >
                {label}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}
