"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { easeOut } from "./Reveal";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "accent" | "ink" | "plain" | "danger";
  big?: boolean;
};

// One button component, four tones. "accent" follows the player's role colour.
export function Button({ tone = "ink", big, className = "", ...rest }: BtnProps) {
  const tones = {
    accent: "bg-[var(--accent)] text-[var(--accent-ink)]",
    ink: "bg-ink text-white",
    plain: "bg-paper text-ink ring-1 ring-ink/20",
    danger: "bg-alarm text-white",
  };
  return (
    <button
      {...rest}
      className={`${big ? "min-h-16 text-xl" : "min-h-12 text-base"} rounded-xl px-5 font-bold disabled:opacity-40 disabled:active:scale-100 ${tones[tone]} ${className}`}
    />
  );
}

export function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "chaser" | "runner" | "ok" | "warn" | "bad" | "ink" }) {
  const tones = {
    plain: "bg-mist/60 text-ink",
    chaser: "bg-flare text-ink",
    runner: "bg-signal text-white",
    ok: "bg-moss text-white",
    warn: "bg-amber text-ink",
    bad: "bg-alarm text-white",
    ink: "bg-ink text-white",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold ${tones[tone]}`}>{children}</span>;
}

export function roleTone(role: string) {
  return role === "chaser" ? "chaser" : role === "runner" ? "runner" : role === "referee" ? "ink" : "plain";
}

export function roleName(role: string) {
  return role === "none" ? "No role yet" : role[0].toUpperCase() + role.slice(1);
}

export function Screen({ children, role = "none" }: { children: ReactNode; role?: string }) {
  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.24, ease: easeOut }} data-role={role} className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 pb-[calc(1.5rem+var(--safe-bottom))] pt-[calc(1rem+var(--safe-top))]">
      {children}
    </motion.main>
  );
}
