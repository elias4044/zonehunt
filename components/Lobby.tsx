"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easeOut } from "./Reveal";
import Logo from "./Logo";
import { api, ApiFailure } from "@/lib/api";
import { zoneLabel } from "@/lib/geo";
import type { Role, SyncResponse } from "@/lib/types";
import type { GpsStatus } from "@/hooks/useGeolocation";
import type { WakeStatus } from "@/hooks/useWakeLock";
import type { Link } from "@/hooks/useGameSync";
import type { Fix } from "@/lib/types";
import LiveMap from "./LiveMap";
import ZoneEditor from "./ZoneEditor";
import { Button, Chip, Screen, roleName, roleTone } from "./ui";

type Props = {
  data: SyncResponse;
  fix: Fix | null;
  gps: GpsStatus;
  retryGps: () => void;
  wake: WakeStatus;
  link: Link;
  syncNow: () => void;
  onLeave: () => void;
};

const MIN = 60;
const SETTINGS = {
  duration_s: {
    label: "Game length",
    options: [10, 15, 20, 30, 45, 60, 90, 120].map(
      (m) => [m * MIN, `${m} min`] as const,
    ),
  },
  reveal_interval_s: {
    label: "Runner positions shown to chasers every",
    options: [
      [15, "15 s"],
      [30, "30 s"],
      [60, "1 min"],
      [120, "2 min"],
      [180, "3 min"],
      [300, "5 min"],
    ] as const,
  },
  head_start_s: {
    label: "Runner head start",
    options: [
      [0, "None"],
      [30, "30 s"],
      [60, "1 min"],
      [120, "2 min"],
      [300, "5 min"],
    ] as const,
  },
  catch_radius_m: {
    label: "Catch distance",
    options: [
      [0, "No check"],
      [50, "50 m"],
      [100, "100 m"],
      [200, "200 m"],
    ] as const,
  },
  compass_range_m: {
    label: "Runner compass range",
    options: [
      [200, "200 m"],
      [400, "400 m"],
      [800, "800 m"],
      [1500, "1.5 km"],
    ] as const,
  },
} as const;

type SettingKey = keyof typeof SETTINGS;

export default function Lobby({
  data,
  fix,
  gps,
  retryGps,
  wake,
  link,
  syncNow,
  onLeave,
}: Props) {
  const reduced = useReducedMotion();
  const { game, me, players } = data;
  const isHost = game.host === me.id;
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [chasers, setChasers] = useState(1);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      syncNow();
    } catch (e) {
      setError(
        e instanceof ApiFailure ? e.message : "That didn't work. Try again.",
      );
    }
  };

  const blocker = (() => {
    if (!game.zone) return "Draw the play zone first.";
    const missing = players.find((p) => p.role === "none");
    if (missing) return `${missing.name} still needs a role.`;
    if (
      !players.some((p) => p.role === "chaser") ||
      !players.some((p) => p.role === "runner")
    )
      return "You need at least one chaser and one runner.";
    const waiting = players.find((p) => !p.ready && p.id !== me.id);
    if (waiting) return `${waiting.name} isn't ready yet.`;
    return null;
  })();

  const share = async () => {
    const text = `Join my Zonehunt game with code ${game.code}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: "Zonehunt",
          text,
          url: location.origin,
        });
      else {
        await navigator.clipboard.writeText(`${text}: ${location.origin}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  const secure = typeof window === "undefined" ? true : window.isSecureContext;
  const preflight = [
    ...(secure
      ? []
      : [
          {
            ok: false,
            label: "Page isn't HTTPS",
            hint: "GPS and keeping the screen awake are blocked. Open the https:// address instead.",
            action: undefined as (() => void) | undefined,
          },
        ]),
    gps === "ok"
      ? {
          ok: true,
          label: "Location is on",
          hint: fix
            ? `Accuracy about ${Math.round(fix.acc)} m`
            : "Waiting for the first fix",
        }
      : gps === "denied"
        ? {
            ok: false,
            label: "Location is blocked",
            hint: "Allow location for this site in your browser settings, then try again.",
            action: retryGps,
          }
        : {
            ok: false,
            label:
              gps === "unavailable"
                ? "No location on this device"
                : "Waiting for location",
            hint: "Say yes to the location prompt.",
            action: retryGps,
          },
    wake === "on"
      ? {
          ok: true,
          label: "Screen stays awake",
          hint: "Keep the app open while you play.",
        }
      : {
          ok: false,
          label:
            wake === "unsupported"
              ? "Can't keep the screen awake"
              : "Screen may turn off",
          hint: "A sleeping phone stops sharing its position. Turn off auto-lock for the game.",
        },
    link === "ok"
      ? { ok: true, label: "Connected", hint: "" }
      : {
          ok: false,
          label: link === "weak" ? "Connection is weak" : "Offline",
          hint: "Positions are sent as soon as you're back online.",
        },
  ];

  return (
    <Screen role={me.role}>
      <div className="flex items-center gap-2 pt-2 text-sm font-bold">
        <Logo className="size-5" />
        Zonehunt
      </div>
      <header className="flex items-start justify-between gap-4 pt-4">
        <div>
          <p className="text-sm font-bold text-ink-soft">Join code</p>
          <p
            className="display text-6xl leading-none tracking-[0.12em]"
            aria-label={`Join code ${game.code.split("").join(" ")}`}
          >
            {game.code}
          </p>
        </div>
        <Button tone="plain" onClick={share}>
          {copied ? "Copied" : "Invite"}
        </Button>
      </header>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-alarm px-4 py-3 font-semibold text-white"
        >
          {error}
        </p>
      )}

      <section className="mt-6" aria-labelledby="preflight">
        <h2 id="preflight" className="text-lg font-extrabold">
          Before you start
        </h2>
        <ul className="mt-2 divide-y divide-ink/10 rounded-xl bg-paper ring-1 ring-ink/15">
          {preflight.map((p) => (
            <li key={p.label} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-black text-white ${p.ok ? "bg-moss" : "bg-amber !text-ink"}`}
              >
                {p.ok ? (
                  <svg
                    viewBox="0 0 20 20"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                ) : (
                  "!"
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.label}</p>
                {p.hint && <p className="text-sm text-ink-soft">{p.hint}</p>}
              </div>
              {"action" in p && p.action && (
                <Button
                  tone="plain"
                  className="!min-h-10 !px-3 text-sm"
                  onClick={p.action}
                >
                  Retry
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6" aria-labelledby="players">
        <h2 id="players" className="text-lg font-extrabold">
          Players{" "}
          <span className="num text-ink-soft">
            {players.length}/{game.max_players}
          </span>
        </h2>
        <ul className="mt-2 space-y-2">
          <AnimatePresence initial={false}>
            {players.map((p) => {
              const mine = p.id === me.id;
              return (
                <motion.li
                  key={p.id}
                  initial={{
                    opacity: 0,
                    transform: reduced ? "none" : "translateY(8px)",
                  }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{
                    opacity: 0,
                    transform: reduced ? "none" : "translateY(8px)",
                  }}
                  transition={{ duration: 0.2, ease: easeOut }}
                  className="rounded-xl bg-paper px-4 py-3 ring-1 ring-ink/15"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">
                      {p.name}
                      {mine && " (you)"}
                    </span>
                    {p.id === game.host && <Chip tone="ink">Host</Chip>}
                    <Chip tone={roleTone(p.role)}>{roleName(p.role)}</Chip>
                    {p.ready ? (
                      <Chip tone="ok">Ready</Chip>
                    ) : (
                      <Chip>Not ready</Chip>
                    )}
                  </div>
                  {(mine || isHost) && (
                    <div
                      className="mt-2 flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Role for ${p.name}`}
                    >
                      {(["chaser", "runner", "referee"] as Role[]).map((r) => (
                        <button
                          key={r}
                          aria-pressed={p.role === r}
                          onClick={() =>
                            run(() => api.role(r, mine ? undefined : p.id))
                          }
                          className={`min-h-10 rounded-lg px-3 font-bold ring-1 ring-ink/20 ${p.role === r ? "bg-ink text-white" : "bg-chalk"}`}
                        >
                          {roleName(r)}
                        </button>
                      ))}
                      {isHost && !mine && (
                        <button
                          onClick={() => run(() => api.leave(p.id))}
                          className="ml-auto min-h-10 rounded-lg px-3 font-bold text-alarm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <Button
          tone={me.ready ? "plain" : "accent"}
          className="mt-3 w-full"
          disabled={me.role === "none"}
          onClick={() => run(() => api.ready(!me.ready))}
        >
          {me.role === "none"
            ? "Pick a role to get ready"
            : me.ready
              ? "I'm not ready"
              : "I'm ready"}
        </Button>
      </section>

      {isHost && (
        <section
          className="mt-6 rounded-xl bg-paper p-4 ring-1 ring-ink/15"
          aria-labelledby="split"
        >
          <h2 id="split" className="font-extrabold">
            Split into teams
          </h2>
          <div className="mt-2 flex items-center gap-3">
            <label htmlFor="nchasers" className="text-sm font-semibold">
              Chasers
            </label>
            <input
              id="nchasers"
              type="number"
              min={1}
              max={Math.max(1, players.length - 1)}
              value={chasers}
              onChange={(e) =>
                setChasers(Math.max(1, Number(e.target.value) || 1))
              }
              className="num min-h-11 w-20 rounded-lg border-2 border-ink/25 px-3 text-lg font-bold"
            />
            <Button
              tone="plain"
              className="flex-1"
              disabled={players.length < 2}
              onClick={() => run(() => api.randomize(chasers))}
            >
              Shuffle teams
            </Button>
          </div>
        </section>
      )}

      <section className="mt-6" aria-labelledby="zone">
        <h2 id="zone" className="text-lg font-extrabold">
          Play zone{" "}
          <span className="font-semibold text-ink-soft">
            {zoneLabel(game.zone)}
          </span>
        </h2>
        {isHost && drawing ? (
          <div className="mt-2">
            <ZoneEditor
              current={game.zone}
              fix={fix}
              onSaved={() => {
                setDrawing(false);
                syncNow();
              }}
            />
          </div>
        ) : (
          <>
            {game.zone && (
              <LiveMap
                className="mt-2 h-56 overflow-hidden rounded-xl ring-1 ring-ink/20"
                zone={game.zone}
                me={fix}
              />
            )}
            {isHost && (
              <Button
                tone="plain"
                className="mt-2 w-full"
                onClick={() => setDrawing(true)}
              >
                {game.zone ? "Change the zone" : "Draw the zone"}
              </Button>
            )}
            {!isHost && !game.zone && (
              <p className="mt-2 text-ink-soft">
                The host is still drawing the zone.
              </p>
            )}
          </>
        )}
      </section>

      <section className="mt-6" aria-labelledby="rules">
        <h2 id="rules" className="text-lg font-extrabold">
          Rules
        </h2>
        <dl className="mt-2 space-y-2">
          {(Object.keys(SETTINGS) as SettingKey[]).map((key) => {
            const s = SETTINGS[key];
            const value = game[key];
            const label =
              s.options.find((o) => o[0] === value)?.[1] ?? String(value);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-2 ring-1 ring-ink/15"
              >
                <dt className="text-sm font-semibold">{s.label}</dt>
                <dd>
                  {isHost ? (
                    <select
                      aria-label={s.label}
                      value={value}
                      onChange={(e) =>
                        run(() => api.config({ [key]: Number(e.target.value) }))
                      }
                      className="min-h-10 rounded-lg border-2 border-ink/25 bg-chalk px-2 font-bold"
                    >
                      {s.options.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-bold">{label}</span>
                  )}
                </dd>
              </div>
            );
          })}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-2 ring-1 ring-ink/15">
            <dt className="text-sm font-semibold">
              Power-ups (Scan and Stealth)
            </dt>
            <dd>
              {isHost ? (
                <input
                  type="checkbox"
                  className="size-6 accent-ink"
                  checked={game.powerups}
                  aria-label="Power-ups"
                  onChange={(e) =>
                    run(() => api.config({ powerups: e.target.checked }))
                  }
                />
              ) : (
                <span className="font-bold">
                  {game.powerups ? "On" : "Off"}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 space-y-3">
        {isHost ? (
          <>
            {blocker && (
              <p className="text-center font-semibold text-ink-soft">
                {blocker}
              </p>
            )}
            <Button
              big
              tone="accent"
              className="w-full"
              disabled={!!blocker}
              onClick={() => run(() => api.start())}
            >
              Start the game
            </Button>
          </>
        ) : (
          <p className="text-center font-semibold text-ink-soft">
            Waiting for the host to start.
          </p>
        )}
        <Button tone="plain" className="w-full" onClick={onLeave}>
          Leave game
        </Button>
      </div>
    </Screen>
  );
}
