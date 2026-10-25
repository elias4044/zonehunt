/*
    The in-game screen: map, clock, and a bottom panel that changes with your role.

    Sections:
    1. Derived state (clock, roles, warnings)
    2. Side effects (vibration cues)
    3. Map dots
    4. Render: top bar, banners, map, role panel, menu, pause overlay

    Naming notes:
    "Reveal" = the snapshot of runner positions chasers get on a timer.
    The accent colour comes from data-role on the root, see globals.css.

    -- Elias, 2026
*/

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easeOut } from "./Reveal";
import { api, ApiFailure } from "@/lib/api";
import { insideZone } from "@/lib/geo";
import { ago, clock } from "@/lib/time";
import type { FeedEvent, Fix, Reveal, SyncResponse } from "@/lib/types";
import type { GpsStatus } from "@/hooks/useGeolocation";
import type { WakeStatus } from "@/hooks/useWakeLock";
import type { Link } from "@/hooks/useGameSync";
import { useHeading } from "@/hooks/useHeading";
import { useTick } from "@/hooks/useTick";
import CatchPad from "./CatchPad";
import Compass from "./Compass";
import LiveMap, { type MapPoint } from "./LiveMap";
import { Button, Chip, roleName, roleTone } from "./ui";

type Props = {
  data: SyncResponse;
  events: FeedEvent[];
  reveal: Reveal | null;
  link: Link;
  lastOkAt: number;
  serverNow: () => number;
  syncNow: () => void;
  fix: Fix | null;
  gps: GpsStatus;
  retryGps: () => void;
  wake: WakeStatus;
  onLeave: () => void;
};

export default function GameScreen(p: Props) {
  const reduced = useReducedMotion();
  const overlayMotion = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2, ease: easeOut } };
  const sheetMotion = { initial: { transform: reduced ? "none" : "translateY(100%)" }, animate: { transform: "translateY(0%)" }, exit: { transform: reduced ? "none" : "translateY(100%)" }, transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const } };
  const { data, events, reveal, fix } = p;
  const { game, me, players } = data;

  useTick(250);
  const now = p.serverNow();
  const [menu, setMenu] = useState(false);
  const [catching, setCatching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  // Derived state

  const paused = game.status === "paused";
  // While paused the clocks stand still, so measure everything from the moment of the pause.
  const ref = paused ? game.paused_at : now;
  const left = game.ends_at - ref;
  const headLeft = game.chase_starts_at - ref;
  const revealIn = game.next_reveal_at - ref;

  const isHost = game.host === me.id;
  const isChaser = me.role === "chaser";
  const isRunner = me.role === "runner";
  const isReferee = me.role === "referee";
  const caught = me.status === "caught";
  const freeRunners = players.filter((x) => x.role === "runner" && x.status === "free").length;
  const hiddenFor = me.stealth_until - now;
  const stealthIn = me.stealth_ready_at - now;
  const scanIn = me.scan_ready_at - now;

  const fixAge = fix ? Date.now() - fix.ts : Infinity;
  const fixFresh = fixAge < 15000;
  // Trust our own fix over the server's flag: it's instant, the flag is up to a sync old.
  const outside = fix && fixFresh ? !insideZone(game.zone, fix.lat, fix.lng) : me.outside;

  const { heading, needsTap, enable } = useHeading(isRunner && !caught);

  // Side effects

  const wasOutside = useRef(false);
  useEffect(() => {
    if (outside && !wasOutside.current) navigator.vibrate?.([200, 100, 200]);
    wasOutside.current = !!outside;
  }, [outside]);

  const wasDanger = useRef(false);
  const danger = !!data.compass && data.compass.distance <= 60;
  useEffect(() => {
    if (danger && !wasDanger.current) navigator.vibrate?.([100, 60, 100, 60, 100]);
    wasDanger.current = danger;
  }, [danger]);

  const lastSeq = useRef(reveal?.seq ?? 0);
  useEffect(() => {
    if (reveal && reveal.seq !== lastSeq.current) {
      lastSeq.current = reveal.seq;
      if (isChaser) navigator.vibrate?.(60);
    }
  }, [reveal, isChaser]);

  // Two short full-screen moments: the game starting, and the head start running out.
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const showFlash = (text: string) => {
    window.clearTimeout(flashTimer.current);
    setFlash(text);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1700);
  };
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const sawStart = useRef(false);
  useEffect(() => {
    if (sawStart.current) return;
    sawStart.current = true;
    // Only for people who were here when it began, not for a phone that reloaded mid-game.
    if (game.status === "active" && p.serverNow() - game.started_at < 6000) showFlash("Game on");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hadHeadStart = useRef(headLeft > 0);
  useEffect(() => {
    const has = headLeft > 0;
    if (hadHeadStart.current && !has && game.status === "active") showFlash(isChaser ? "Hunt" : isRunner ? "Run" : "Chase on");
    hadHeadStart.current = has;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headLeft > 0]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      p.syncNow();
    } catch (e) {
      setToast(e instanceof ApiFailure ? e.message : "That didn't work. Try again.");
      setTimeout(() => setToast(null), 4000);
    }
  };

  // Map dots

  const bucket = Math.floor(now / 5000);
  const points = useMemo<MapPoint[]>(() => {
    const t = p.serverNow();
    if (isReferee && data.live) {
      return data.live.flatMap((l) => {
        const who = players.find((x) => x.id === l.id);
        if (!who) return [];
        const tone = who.role === "chaser" ? "chaser" : who.role === "runner" ? "runner" : "other";
        return [{ id: l.id, label: who.name, lat: l.lat, lng: l.lng, fade: 1, tone } as MapPoint];
      });
    }
    if (!reveal || !(isChaser || caught || isReferee)) return [];
    const span = game.reveal_interval_s * 1000 * 1.5;
    const fade = Math.max(0, 1 - (t - reveal.at) / span);
    return reveal.points.map((pt) => ({
      id: pt.id,
      label: `${pt.name} · ${ago(t - pt.t)}`,
      lat: pt.lat,
      lng: pt.lng,
      fade,
      tone: "runner" as const,
    }));
    // The 5 s bucket keeps the labels' "x s ago" fresh without rebuilding markers every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, data.live, bucket, isChaser, isReferee, caught]);

  // Warnings, most urgent first. We only ever show two so the map stays visible.
  const banners: { key: string; tone: "bad" | "warn"; text: string; pulse?: boolean }[] = [];
  if (outside && !paused) banners.push({ key: "zone", tone: "bad", text: "You're outside the play zone. Head back in.", pulse: true });
  if (p.gps === "denied") banners.push({ key: "gps", tone: "bad", text: "Location is blocked, so nobody can see you or use your compass. Allow it in browser settings." });
  if (p.link !== "ok") banners.push({ key: "link", tone: "warn", text: `No connection. Last update ${ago(Date.now() - p.lastOkAt)}. We'll catch up when you're back online.` });
  if (p.gps === "ok" && !fixFresh) banners.push({ key: "fix", tone: "warn", text: `Waiting for a GPS fix. Last one ${ago(fixAge)}.` });
  if (p.wake !== "on") banners.push({ key: "wake", tone: "warn", text: "Keep the screen on. A sleeping phone stops sharing your position." });
  const shown = banners.slice(0, 2);

  const lastPause = [...events].reverse().find((e) => e.kind === "pause");

  // Render

  return (
    <div data-role={me.role} className="relative flex h-dvh flex-col bg-chalk">
      <header className="z-[1200] bg-[var(--accent)] pt-[var(--safe-top)] text-[var(--accent-ink)]">
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold leading-tight">{roleName(me.role)}</p>
            <p className="truncate text-sm font-semibold opacity-90">
              {caught ? "Caught" : isChaser || isReferee ? `${freeRunners} runner${freeRunners === 1 ? "" : "s"} free` : "Still free"}
            </p>
          </div>
          <p className={`display text-6xl leading-none ${left < 60000 && left > 0 && !paused ? "zh-throb text-amber" : ""}`} aria-label="Time left" aria-live="off">{clock(left)}</p>
          <div className="flex gap-2">
            {game.status === "active" && (
              <button onClick={() => run(() => api.pause(true))} aria-label="Pause the game" className="grid size-11 place-items-center rounded-xl bg-white/20 active:bg-white/35">
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              </button>
            )}
            <button onClick={() => setMenu(true)} aria-label="Open the game menu" className="grid size-11 place-items-center rounded-xl bg-white/20 active:bg-white/35">
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
        <AnimatePresence initial={false}>{shown.map((b) => (
          <motion.p {...overlayMotion} key={b.key} role={b.tone === "bad" ? "alert" : "status"}
            className={`px-4 py-2 text-sm font-bold ${b.tone === "bad" ? "bg-alarm text-white" : "bg-amber text-ink"} ${b.pulse ? "zh-pulse" : ""}`}>
            {b.text}
          </motion.p>
        ))}</AnimatePresence>
      </header>

      <LiveMap className="min-h-0 flex-1" zone={game.zone} me={fix} points={points} follow={!isReferee} pingKey={reveal?.seq} />

      <section aria-label="Your status" className="z-[1200] rounded-t-3xl bg-paper px-4 pb-[calc(1rem+var(--safe-bottom))] pt-4 shadow-[0_-8px_24px_rgba(15,26,44,0.18)]">
        {caught ? (
          <div className="py-2">
            <p className="display text-4xl">You've been caught</p>
            <p className="mt-1 font-medium text-ink-soft">Your code no longer works. You can still follow the chase on the map.</p>
          </div>
        ) : isChaser ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm font-bold text-ink-soft">{headLeft > 0 ? "Chase starts in" : "Next runner update"}</p>
              <p className="display text-5xl leading-none">{clock(headLeft > 0 ? headLeft : revealIn)}</p>
              <p className="mt-1 text-sm font-medium text-ink-soft">{reveal ? `Last update ${ago(now - reveal.at)}${reveal.kind === "scan" ? " (scan)" : ""}` : "No update yet"}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button big tone="accent" disabled={headLeft > 0 || paused} onClick={() => setCatching(true)}>Enter code</Button>
              {game.powerups && (
                <Button tone="plain" disabled={scanIn > 0 || headLeft > 0 || paused} onClick={() => run(() => api.powerup("scan"))}>
                  {scanIn > 0 && headLeft <= 0 ? `Scan in ${clock(scanIn)}` : "Scan now"}
                </Button>
              )}
            </div>
          </div>
        ) : isRunner ? (
          <div className="grid grid-cols-[auto_1fr] items-center gap-4">
            <Compass reading={data.compass} heading={heading} needsTap={needsTap} enable={enable} rangeM={game.compass_range_m} />
            <div>
              <p className="text-sm font-bold text-ink-soft">Your catch code</p>
              <p className="display text-6xl leading-none tracking-[0.1em]">{me.catch_code || "····"}</p>
              <p className="mt-1 text-sm font-medium text-ink-soft">Only give it to a chaser who reaches you.</p>
              <p className="mt-2 text-sm font-bold">
                {hiddenFor > 0 ? `Hidden from chasers for ${clock(hiddenFor)}` : headLeft > 0 ? `Head start ends in ${clock(headLeft)}` : `Chasers see you in ${clock(revealIn)}`}
              </p>
              {game.powerups && (
                <Button tone="plain" className="mt-2 !min-h-11 w-full" disabled={stealthIn > 0 || paused} onClick={() => run(() => api.powerup("stealth"))}>
                  {stealthIn > 0 ? (hiddenFor > 0 ? "Stealth is on" : `Stealth in ${clock(stealthIn)}`) : "Hide for 45 s"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="font-extrabold">Everyone on the map</p>
            <p className="text-sm font-medium text-ink-soft">You can see all players live. Open the menu for the roster.</p>
          </div>
        )}
      </section>

      {flash && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[1950] grid place-items-center bg-[var(--accent)]/85 text-[var(--accent-ink)]">
          <p key={flash} className="display zh-splash whitespace-nowrap px-4 text-center text-7xl">{flash}</p>
        </div>
      )}

      <AnimatePresence>{toast && <motion.p {...overlayMotion} key="toast" role="alert" className="fixed inset-x-4 bottom-28 z-[2100] mx-auto max-w-md rounded-xl bg-ink px-4 py-3 text-center font-semibold text-white shadow-lg">{toast}</motion.p>}</AnimatePresence>

      <AnimatePresence>{catching && <CatchPad key="catch" onClose={() => setCatching(false)} onCaught={p.syncNow} />}</AnimatePresence>

      <AnimatePresence>{menu && (
        <motion.div {...overlayMotion} key="menu" role="dialog" aria-modal="true" aria-label="Game menu" className=" fixed inset-0 z-[2000] flex items-end bg-ink/60">
          <motion.div {...sheetMotion} className="mx-auto max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[calc(1.25rem+var(--safe-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Game menu</h2>
              <button onClick={() => setMenu(false)} className="min-h-11 px-2 font-bold text-ink-soft">Close</button>
            </div>
            <p className="text-sm font-semibold text-ink-soft">Code {game.code}</p>

            <h3 className="mt-4 font-extrabold">Players</h3>
            <ul className="mt-1 divide-y divide-ink/10">
              {players.map((x) => {
                const silentFor = x.seen ? now - x.seen : Infinity;
                return (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-bold">{x.name}{x.id === me.id && " (you)"}</span>
                    <Chip tone={roleTone(x.role)}>{roleName(x.role)}</Chip>
                    {x.status === "caught" && <Chip tone="bad">Caught</Chip>}
                    {silentFor > 60000 && x.id !== me.id && <Chip tone="warn">Not heard from {silentFor === Infinity ? "yet" : ago(silentFor)}</Chip>}
                  </li>
                );
              })}
            </ul>

            <h3 className="mt-4 font-extrabold">Feed</h3>
            <ul className="mt-1 space-y-1 text-sm">
              {[...events].reverse().slice(0, 12).map((e) => (
                <li key={e.id}><span className="num text-ink-soft">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> {e.text}</li>
              ))}
            </ul>

            <div className="mt-5 space-y-2">
              {game.status === "active" && <Button tone="plain" className="w-full" onClick={() => { setMenu(false); run(() => api.pause(true)); }}>Pause the game</Button>}
              {isHost && (
                <Button tone={confirmEnd ? "danger" : "plain"} className="w-full" onClick={() => { if (confirmEnd) { setMenu(false); run(() => api.end()); } else setConfirmEnd(true); }}>
                  {confirmEnd ? "Tap again to end it for everyone" : "End the game for everyone"}
                </Button>
              )}
              <Button tone="plain" className="w-full" onClick={p.onLeave}>Leave game</Button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{paused && (
        <motion.div {...overlayMotion} key="paused" role="alertdialog" aria-label="Game paused" className=" fixed inset-0 z-[1900] grid place-items-center bg-ink/90 p-6 text-center text-white">
          <div className="max-w-sm">
            <p className="display zh-pop text-6xl">Paused</p>
            <p className="mt-3 text-lg font-medium">{lastPause?.text ?? "The game is paused."} The clock is stopped, and nobody's position is being shared.</p>
            {isHost ? (
              <Button big tone="accent" className="mt-6 w-full" onClick={() => run(() => api.pause(false))}>Resume the game</Button>
            ) : (
              <p className="mt-6 font-bold">Waiting for the host to resume.</p>
            )}
            <button onClick={() => setMenu(true)} className="mt-4 min-h-11 font-bold underline">Open menu</button>
          </div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
