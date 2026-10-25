"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure, pb } from "@/lib/api";
import type { FeedEvent, Fix, Reveal, SyncResponse } from "@/lib/types";

export type Link = "ok" | "weak" | "offline";

type Options = {
  enabled: boolean;
  gameId: string | null;
  fix: Fix | null;
  // Called when the server says this session is dead (game wiped, token gone).
  onLost: (why: "game_gone" | "auth") => void;
};

const BASE_DELAY: Record<string, number> = { lobby: 5000, active: 4000, paused: 6000, ended: 8000 };

/*
  The one loop that keeps a phone in sync with the game.

  Every few seconds it posts our latest GPS fix to /api/mh/sync and gets back the whole
  picture: game state, roster, our own status, compass, new reveals, new feed events.
  Because the response is always complete, a phone that slept for two minutes catches up
  in a single request, and nothing depends on a websocket staying alive.

  PocketBase realtime is only a nudge. When anything in the game changes we sync right
  away instead of waiting for the next tick. If realtime dies, the loop still works.

  Failure handling: back off up to 15 s, flip the link to "weak" then "offline" so the UI
  can say so honestly, and carry on. We only give up on a 401 or 404 from the server.
*/
export function useGameSync({ enabled, gameId, fix, onLost }: Options) {
  const [data, setData] = useState<SyncResponse | null>(null);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [link, setLink] = useState<Link>("ok");
  const [lastOkAt, setLastOkAt] = useState(0);

  const fixRef = useRef<Fix | null>(null);
  const onLostRef = useRef(onLost);
  const offset = useRef(0);
  const revealSeq = useRef(0);
  const eventAt = useRef(0);
  const failures = useRef(0);
  const statusRef = useRef("lobby");
  const nudgeRef = useRef<(gap?: number) => void>(() => {});

  useEffect(() => {
    fixRef.current = fix;
    onLostRef.current = onLost;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    let inflight = false;
    let queued = false;
    let lastHint = 0;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(run, delay);
    };

    const nextDelay = () => {
      const base = BASE_DELAY[statusRef.current] ?? 5000;
      return Math.min(base * 2 ** failures.current, 15000);
    };

    async function run() {
      if (stopped) return;
      if (inflight) {
        queued = true;
        return;
      }
      inflight = true;
      try {
        // A fix older than a minute would only mislead the server, so leave it out.
        const f = fixRef.current;
        const fresh = f && Date.now() - f.ts < 60000 ? f : null;
        const t0 = Date.now();
        const res = await api.sync(fresh, revealSeq.current, eventAt.current);
        if (stopped) return;
        const t1 = Date.now();
        // Half the round trip is our best guess at when the server stamped `now`.
        offset.current = res.now - (t0 + t1) / 2;
        failures.current = 0;
        statusRef.current = res.game.status;
        setLastOkAt(t1);
        setLink("ok");
        setData(res);
        if (res.reveal) {
          revealSeq.current = res.reveal.seq;
          setReveal(res.reveal);
        }
        if (res.events.length) {
          eventAt.current = Math.max(eventAt.current, ...res.events.map((e) => e.at));
          setEvents((prev) => {
            const have = new Set(prev.map((e) => e.id));
            const add = res.events.filter((e) => !have.has(e.id));
            return add.length ? [...prev, ...add].slice(-200) : prev;
          });
        }
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiFailure && (err.status === 401 || err.status === 403 || err.status === 404)) {
          stopped = true;
          onLostRef.current(err.status === 404 ? "game_gone" : "auth");
          return;
        }
        failures.current += 1;
        setLink(failures.current >= 2 || !navigator.onLine ? "offline" : "weak");
      } finally {
        inflight = false;
        if (!stopped) {
          if (queued) {
            queued = false;
            schedule(0);
          } else {
            schedule(nextDelay());
          }
        }
      }
    }

    // Sync soon, but not in a storm: a burst of realtime events becomes one request.
    const nudge = (minGap = 1200) => {
      const now = Date.now();
      if (now - lastHint < minGap) return;
      lastHint = now;
      schedule(150);
    };
    nudgeRef.current = nudge;

    const onVisible = () => {
      if (document.visibilityState === "visible") nudge(0);
    };
    const onOnline = () => nudge(0);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    const unsubs: Promise<() => Promise<void>>[] = [];
    if (gameId) {
      const sub = (col: string, topic: string) =>
        pb
          .collection(col)
          .subscribe(topic, () => nudge())
          .catch(() => () => Promise.resolve());
      unsubs.push(sub("games", gameId), sub("players", "*"), sub("reveals", "*"), sub("events", "*"));
    }

    run();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      unsubs.forEach((p) => p.then((off) => off()).catch(() => {}));
    };
  }, [enabled, gameId]);

  // First fix after a cold start: don't wait for the next tick to tell the server.
  const hasFix = !!fix;
  useEffect(() => {
    if (hasFix) nudgeRef.current(0);
  }, [hasFix]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  const syncNow = useCallback(() => nudgeRef.current(0), []);

  return { data, events, reveal, link, lastOkAt, serverNow, syncNow };
}
