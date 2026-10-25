"use client";

import { useCallback, useEffect, useState } from "react";
import { api, dropSession, hasToken, pb } from "@/lib/api";
import type { Session } from "@/lib/types";
import { useGameSync } from "@/hooks/useGameSync";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useWakeLock } from "@/hooks/useWakeLock";
import GameScreen from "./GameScreen";
import Home from "./Home";
import Lobby from "./Lobby";
import Result from "./Result";
import { Button, Screen } from "./ui";
import { MotionConfig } from "framer-motion";

/*
  Top-level state machine. There are only two places to be: the home screen (no session)
  and inside a game. Which screen you see inside a game comes straight from the server's
  game status, so a refresh, a crash or a phone call never loses your place.
*/
export default function App() {
  return <MotionConfig reducedMotion="user"><AppContent /></MotionConfig>;
}

function AppContent() {
  const [booted, setBooted] = useState(false);
  const [inGame, setInGame] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // A stored token means we were in a game when the page closed. The first sync
    // tells us whether that game still exists.
    if (hasToken()) {
      const rec = pb.authStore.record as { game?: string } | null;
      setGameId(rec?.game ?? null);
      setInGame(true);
    }
    setBooted(true);
  }, []);

  const enter = useCallback((s: Session) => {
    setNotice(null);
    setGameId(s.game.id);
    setInGame(true);
  }, []);

  const exit = useCallback((message: string | null) => {
    dropSession();
    setGameId(null);
    setInGame(false);
    setNotice(message);
  }, []);

  if (!booted) return <Screen><p className="pt-20 text-center font-semibold text-ink-soft">Loading…</p></Screen>;
  if (!inGame) return <Home notice={notice} onSession={enter} />;
  return <InGame gameId={gameId} onExit={exit} />;
}

function InGame({ gameId, onExit }: { gameId: string | null; onExit: (message: string | null) => void }) {
  const gps = useGeolocation(true);
  const wake = useWakeLock(true);
  const sync = useGameSync({
    enabled: true,
    gameId,
    fix: gps.fix,
    onLost: (why) => onExit(why === "game_gone" ? "That game has ended and been cleared." : "You were removed from the game."),
  });
  const { data } = sync;

  const leave = async () => {
    // Best effort. If we're offline we still leave locally; the server cleans up on its own.
    try {
      await api.leave();
    } catch {}
    onExit(null);
  };

  if (!data) {
    return (
      <Screen>
        <div className="my-auto text-center">
          <p className="display text-5xl">{sync.link === "ok" ? "Joining…" : "Reconnecting…"}</p>
          {sync.link !== "ok" && <p className="mt-2 font-medium text-ink-soft">Can't reach the server yet. We'll keep trying.</p>}
          <Button tone="plain" className="mt-6" onClick={leave}>Cancel</Button>
        </div>
      </Screen>
    );
  }

  const { game } = data;
  if (game.status === "lobby") {
    return (
      <Lobby data={data} fix={gps.fix} gps={gps.status} retryGps={gps.retry} wake={wake} link={sync.link} syncNow={sync.syncNow} onLeave={leave} />
    );
  }
  if (game.status === "ended") return <Result data={data} events={sync.events} onLeave={leave} />;
  return (
    <GameScreen
      data={data} events={sync.events} reveal={sync.reveal} link={sync.link} lastOkAt={sync.lastOkAt}
      serverNow={sync.serverNow} syncNow={sync.syncNow} fix={gps.fix} gps={gps.status} retryGps={gps.retry}
      wake={wake} onLeave={leave}
    />
  );
}
