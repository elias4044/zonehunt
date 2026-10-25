"use client";

import type { FeedEvent, SyncResponse } from "@/lib/types";
import { Button, Screen } from "./ui";

export default function Result({ data, events, onLeave }: { data: SyncResponse; events: FeedEvent[]; onLeave: () => void }) {
  const { game, me } = data;
  const mineIsChaser = me.role === "chaser";
  const iWon =
    game.winner === "chasers" ? mineIsChaser : game.winner === "runners" ? me.role === "runner" : null;

  const headline =
    game.winner === "chasers" ? "Chasers win" : game.winner === "runners" ? "Runners win" : "Game over";
  const sub =
    iWon === null
      ? game.winner === "none" ? "The game ended without a winner." : "Thanks for playing."
      : iWon ? "That's your team." : "Better luck next round.";

  return (
    <Screen role={me.role}>
      <header className="pt-10">
        <h1 className="display text-7xl leading-[0.85]">{headline}</h1>
        <p className="mt-3 text-xl font-semibold text-ink-soft">{sub}</p>
      </header>

      <section className="mt-8" aria-labelledby="story">
        <h2 id="story" className="text-lg font-extrabold">How it went</h2>
        <ul className="mt-2 divide-y divide-ink/10 rounded-xl bg-paper ring-1 ring-ink/15">
          {events.filter((e) => e.kind !== "join").map((e) => (
            <li key={e.id} className="flex gap-3 px-4 py-3">
              <span className="num shrink-0 text-ink-soft">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="font-medium">{e.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-6 text-sm text-ink-soft">
        Everyone's locations, routes and the feed are deleted a few minutes after the game ends.
      </p>
      <Button big tone="ink" className="mt-auto w-full" onClick={onLeave}>Done</Button>
    </Screen>
  );
}
