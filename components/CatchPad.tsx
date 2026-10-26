"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { easeOut } from "./Reveal";
import { api, ApiFailure } from "@/lib/api";
import { Button } from "./ui";

type Result = { name: string; remaining: number };


export default function CatchPad({ onClose, onCaught }: { onClose: () => void; onCaught: () => void }) {
  const reduced = useReducedMotion();
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (digits.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    api
      .catchRunner(digits)
      .then((r) => {
        setResult({ name: r.caught.name, remaining: r.remaining });
        navigator.vibrate?.([120, 60, 120]);
        onCaught();
      })
      .catch((e) => {
        setError(e instanceof ApiFailure ? e.message : "Couldn't check that code.");
        navigator.vibrate?.(250);
        setDigits("");
      })
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const press = (d: string) => {
    if (busy || result) return;
    setError(null);
    setDigits((v) => (v.length < 4 ? v + d : v));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2, ease: easeOut }} role="dialog" aria-modal="true" aria-label="Enter catch code" className=" fixed inset-0 z-[2000] flex items-end bg-ink/60">
      <motion.div initial={{ transform: reduced ? "none" : "translateY(100%)" }} animate={{ transform: "translateY(0%)" }} exit={{ transform: reduced ? "none" : "translateY(100%)" }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }} className="mx-auto w-full max-w-xl rounded-t-3xl bg-paper p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
        {result ? (
          <div className="py-4 text-center">
            <svg viewBox="0 0 52 52" className="zh-pop mx-auto mb-2 size-16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="26" cy="26" r="23" className="text-moss" />
              <path d="M15 27l8 8 14-16" className="zh-draw text-moss" pathLength="100" />
            </svg>
            <p className="display zh-rise text-5xl">{result.name} is caught</p>
            <p className="mt-2 text-lg font-semibold text-ink-soft">
              {result.remaining === 0 ? "That was the last runner." : `${result.remaining} runner${result.remaining === 1 ? "" : "s"} still free.`}
            </p>
            <Button tone="accent" big className="mt-5 w-full" onClick={onClose}>Back to the chase</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold">Runner's catch code</h2>
              <button onClick={onClose} className="min-h-11 px-2 font-bold text-ink-soft">Cancel</button>
            </div>
            <div className="my-3 flex justify-center gap-3" aria-live="polite" aria-label={`${digits.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={`display grid h-16 w-14 place-items-center rounded-xl bg-chalk text-5xl ring-2 transition ${digits[i] ? "ring-ink" : "ring-ink/20"}`}>
                  {digits[i] ? <span key={digits[i] + i} >{digits[i]}</span> : ""}
                </span>
              ))}
            </div>
            <p role="alert" className="min-h-6 text-center font-semibold text-alarm">{error}</p>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} onClick={() => press(d)} className="display h-16 rounded-xl bg-chalk text-4xl active:bg-mist">{d}</button>
              ))}
              <button onClick={() => setDigits("")} className="h-16 rounded-xl bg-chalk text-base font-bold active:bg-mist">Clear</button>
              <button onClick={() => press("0")} className="display h-16 rounded-xl bg-chalk text-4xl active:bg-mist">0</button>
              <button onClick={() => setDigits((v) => v.slice(0, -1))} aria-label="Delete last digit" className="h-16 rounded-xl bg-chalk text-2xl font-bold active:bg-mist">⌫</button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
