"use client";

import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { bearingWord } from "@/lib/geo";
import type { CompassReading } from "@/lib/types";

type Props = {
  reading: CompassReading | null;
  heading: number | null;
  needsTap: boolean;
  enable: () => void;
  rangeM: number;
};

// Turns a bearing into an angle that never jumps. Going from 350 to 10 degrees becomes
// +20 instead of -340, so the needle takes the short way round instead of spinning.
function useContinuousAngle(target: number) {
  const last = useRef(target);
  const delta = ((((target - last.current) % 360) + 540) % 360) - 180;
  last.current = last.current + delta;
  return last.current;
}

const swing = { transition: "transform 0.25s var(--ease-out)" } as const;
const follow = { transition: "transform 0.16s var(--ease-out)" } as const;


export default function Compass({ reading, heading, needsTap, enable, rangeM }: Props) {
  const reduced = useReducedMotion();
  const rot = useContinuousAngle(heading ?? 0);
  const needle = useContinuousAngle(reading ? reading.bearing - (heading ?? 0) : 0);
  const danger = reading !== null && reading.distance <= 60;
  const color = !reading ? "#12875a" : danger ? "#d3213b" : "#2f5bff";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="-110 -110 220 220" className={`size-40 ${danger ? "zh-pulse rounded-full" : ""}`} role="img"
        aria-label={reading ? `Nearest chaser ${reading.distance} metres to the ${bearingWord(reading.bearing)}` : "No chasers nearby"}>
        <circle r="100" fill="#fff" stroke="#0f1a2c" strokeWidth="5" />
        <circle r="60" fill="none" stroke="#0f1a2c" strokeOpacity="0.15" strokeWidth="2" />
        <g style={{ transform: `rotate(${-rot}deg)`, transition: reduced ? "none" : follow.transition }}>
          <text y="-80" textAnchor="middle" fontSize="20" fontWeight="800" fill="#0f1a2c">N</text>
          <path d="M0 -100 V-92" stroke="#0f1a2c" strokeWidth="4" />
        </g>
        {reading ? (
          <g style={{ transform: `rotate(${needle}deg)`, transition: reduced ? "none" : swing.transition }}>
            <path d="M0 -70 L20 10 L0 -2 L-20 10 Z" fill={color} stroke="#fff" strokeWidth="3" strokeLinejoin="round" style={{ transition: "fill 0.3s" }} />
          </g>
        ) : (
          <circle r="12" fill={color} style={{ transition: "fill 0.3s" }} />
        )}
      </svg>
      <p className="display mt-1 text-4xl leading-none" style={{ color }}>
        {reading ? `${reading.distance} m` : "Clear"}
      </p>
      <p className="mt-1 text-center text-sm font-semibold text-ink-soft">
        {reading
          ? `${reading.count > 1 ? `${reading.count} chasers near, closest is ` : "Chaser "}${bearingWord(reading.bearing)}`
          : `No chasers within ${rangeM >= 1000 ? rangeM / 1000 + " km" : rangeM + " m"}`}
      </p>
      {heading === null && (
        needsTap ? (
          <button onClick={enable} className="mt-1 min-h-10 rounded-lg bg-ink px-3 text-sm font-bold text-white">Turn compass with me</button>
        ) : (
          <p className="mt-1 text-xs font-medium text-ink-soft">North is up</p>
        )
      )}
    </div>
  );
}
