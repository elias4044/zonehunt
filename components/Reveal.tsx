"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { useAnimate } from "framer-motion/mini";

export const easeOut = [0.23, 1, 0.32, 1] as const;

export default function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [scope, animate] = useAnimate();
  const visible = useInView(scope, { once: true, amount: 0.12 });
  const reduced = useReducedMotion();
  const played = useRef(false);

  useEffect(() => {
    if (!visible || played.current) return;
    played.current = true;
    const elements = scope.current.querySelectorAll("[data-reveal]");
    elements.forEach((element: Element, index: number) => {
      animate(element, {
        opacity: [0.85, 1],
        transform: reduced ? ["none", "none"] : ["translateY(24px)", "translateY(0px)"],
      }, { duration: reduced ? 0.16 : 0.6, delay: Math.min(index, 5) * 0.06, ease: easeOut });
    });
  }, [visible, animate, reduced, scope]);

  return <div ref={scope} className={className}>{children}</div>;
}
