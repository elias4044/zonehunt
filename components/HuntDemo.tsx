"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easeOut } from "./Reveal";

export function ZoneMap({
  revealed = false,
  compact = false,
}: {
  revealed?: boolean;
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`zone-map ${compact ? "zone-map-compact" : ""}`}
      role="img"
      aria-label="Illustrated demo play zone with a chaser and two runner positions"
    >
      <svg
        className="zone-map-art"
        viewBox="0 0 700 480"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <rect width="700" height="480" fill="#e4e9e2" />
        <path
          d="M-40 110 175 135 280 60 435 95 550 40 740 75M-40 390 170 310 300 350 425 270 740 300M110-20 155 145 110 270 170 500M465-20 420 160 470 320 420 510M-20 225 205 210 330 255 540 180 730 195"
          fill="none"
          stroke="#fff"
          strokeWidth="18"
        />
        <path
          d="m555-30-30 130 48 113-35 110 60 190"
          fill="none"
          stroke="#bfd9e4"
          strokeWidth="48"
        />
        <path
          d="m220 100 223 18 65 162-118 123-213-57-42-142Z"
          fill="#2f5bff"
          fillOpacity=".07"
          stroke="#2f5bff"
          strokeWidth="3"
          strokeDasharray="8 8"
        />
        <path
          d="m239 270 58-40 42 22 59-69"
          fill="none"
          stroke="#ff5a1f"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="1 12"
        />
        <g fill="#cad6c3">
          <path d="m215 135 55 5-8 47-55-8Z" />
          <path d="m350 280 63 10-15 47-60-8Z" />
          <path d="m40 310 48-11 20 55-47 14Z" />
          <path d="m575 120 56 12-14 40-55-10Z" />
        </g>
      </svg>
      <span className="map-place place-one">North park</span>
      <span className="map-place place-two">River walk</span>
      <span
        className="map-player map-chaser"
        style={{ left: "34%", top: "56%" }}
      >
        You
      </span>
      <AnimatePresence initial={false}>
        {revealed &&
          [
            { name: "Mia", left: "56%", top: "38%" },
            { name: "Alex", left: "43%", top: "68%" },
          ].map((player, index) => (
            <motion.span
              key={player.name}
              className="map-player map-runner"
              style={{ left: player.left, top: player.top }}
              initial={{
                opacity: 0,
                transform: reduced ? "none" : "translateY(8px)",
              }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{
                opacity: 0,
                transform: reduced ? "none" : "translateY(8px)",
              }}
              transition={{
                duration: 0.24,
                ease: easeOut,
                delay: index * 0.06,
              }}
            >
              {player.name}
            </motion.span>
          ))}
      </AnimatePresence>
      <span className="map-zone-label">Play zone</span>
    </div>
  );
}

export function DemoCompass() {
  return (
    <div
      className="demo-compass"
      role="img"
      aria-label="Demo runner compass: nearest chaser 180 metres northeast"
    >
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <circle cx="120" cy="120" r="102" fill="white" />
        <circle
          cx="120"
          cy="120"
          r="76"
          fill="none"
          stroke="#e6e9ec"
          strokeWidth="2"
        />
        <path
          d="M120 24v10m96 86h-10m-86 96v-10M24 120h10"
          stroke="#0f1a2c"
          strokeWidth="3"
        />
        <text
          x="120"
          y="58"
          textAnchor="middle"
          fill="#0f1a2c"
          fontSize="15"
          fontWeight="700"
        >
          N
        </text>
        <g className="demo-needle">
          <path d="m120 65 18 78-18-13-18 13Z" fill="#2f5bff" />
          <circle cx="120" cy="120" r="7" fill="#0f1a2c" />
        </g>
      </svg>
      <strong className="display">180 m</strong>
      <span>Nearest chaser, northeast</span>
    </div>
  );
}

export default function HuntDemo() {
  const [role, setRole] = useState<"chaser" | "runner">("chaser");
  const [revealed, setRevealed] = useState(false);
  const reduce = useReducedMotion();

  return (
    <div data-ui className="hunt-demo">
      <div className="demo-toolbar">
        <span className="demo-caption">Try the two sides</span>
        <div className="demo-switch" role="group" aria-label="Preview a role">
          {(["chaser", "runner"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={role === value}
              onClick={() => setRole(value)}
            >
              {value === "chaser" ? "Chaser" : "Runner"}
            </button>
          ))}
        </div>
      </div>
      <div className="demo-stage">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={role}
            className="demo-view"
            initial={{
              opacity: 0,
              transform: reduce ? "none" : "translateY(10px)",
            }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            exit={{
              opacity: 0,
              transform: reduce ? "none" : "translateY(-10px)",
            }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
            {role === "chaser" ? (
              <ZoneMap revealed={revealed} />
            ) : (
              <div className="runner-demo-stage">
                <DemoCompass />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="demo-clock">
          <span>Time remaining</span>
          <strong className="display">14:32</strong>
        </div>
        <span className="demo-label">Interactive demo</span>
      </div>
      <div className="demo-bottom">
        <div>
          <strong>
            {role === "chaser"
              ? revealed
                ? "Runner positions revealed"
                : "They are out there"
              : "Keep your distance"}
          </strong>
          <p>
            {role === "chaser"
              ? "Positions arrive in snapshots. The chase is up to you."
              : "A bearing and a distance. Your escape is up to you."}
          </p>
        </div>
        {role === "chaser" ? (
          <button
            className="demo-reveal"
            onClick={() => setRevealed((value) => !value)}
          >
            {revealed ? "Hide positions" : "Reveal runners"}
            <span aria-hidden="true">+</span>
          </button>
        ) : (
          <span className="runner-role-note">You are a runner</span>
        )}
      </div>
    </div>
  );
}
