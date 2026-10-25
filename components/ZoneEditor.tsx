"use client";

import { useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { formatDistance } from "@/lib/geo";
import type { Fix, LatLng, Zone } from "@/lib/types";
import LiveMap from "./LiveMap";
import { Button } from "./ui";

/*
  Host-only. Two ways to draw the play zone: a circle (tap the centre, drag the slider)
  or a polygon (tap the corners). The preview updates live and nothing is saved
  until "Save zone", so the other players never see a half-drawn shape.
*/
export default function ZoneEditor({ current, fix, onSaved }: { current: Zone | null; fix: Fix | null; onSaved: () => void }) {
  const [shape, setShape] = useState<"circle" | "polygon">(current?.type ?? "circle");
  const [center, setCenter] = useState<LatLng | null>(current?.type === "circle" ? [current.lat, current.lng] : null);
  const [radius, setRadius] = useState(current?.type === "circle" ? current.radius : 400);
  const [corners, setCorners] = useState<LatLng[]>(current?.type === "polygon" ? current.points : []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft: Zone | null =
    shape === "circle" && center
      ? { type: "circle", lat: center[0], lng: center[1], radius }
      : shape === "polygon" && corners.length >= 3
        ? { type: "polygon", points: corners }
        : null;

  const tap = (lat: number, lng: number) => {
    if (shape === "circle") setCenter([lat, lng]);
    else setCorners((c) => (c.length < 40 ? [...c, [lat, lng]] : c));
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await api.config({ zone: draft });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't save the zone.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="group" aria-label="Zone shape">
        {(["circle", "polygon"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setShape(s)}
            aria-pressed={shape === s}
            className={`min-h-11 flex-1 rounded-xl font-bold ring-1 ring-ink/20 ${shape === s ? "bg-ink text-white" : "bg-paper"}`}
          >
            {s === "circle" ? "Circle" : "Draw corners"}
          </button>
        ))}
      </div>

      <LiveMap
        className="h-72 overflow-hidden rounded-xl ring-1 ring-ink/20"
        zone={draft}
        me={fix}
        draft={shape === "polygon" && corners.length < 3 ? corners : []}
        onTap={tap}
        fit="first"
      />

      <p className="text-sm font-medium text-ink-soft">
        {shape === "circle"
          ? center ? "Tap the map to move the centre." : "Tap the map to place the centre of the zone."
          : `Tap each corner of the zone in order. ${corners.length} placed${corners.length < 3 ? ", need at least 3" : ""}.`}
      </p>

      {shape === "circle" ? (
        <div className="flex items-center gap-3">
          <input
            type="range" min={100} max={3000} step={50} value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            aria-label="Zone radius" className="h-8 flex-1 accent-ink"
          />
          <span className="num w-20 text-right font-bold">{formatDistance(radius)}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button tone="plain" className="flex-1" disabled={!corners.length} onClick={() => setCorners((c) => c.slice(0, -1))}>Undo corner</Button>
          <Button tone="plain" className="flex-1" disabled={!corners.length} onClick={() => setCorners([])}>Clear</Button>
        </div>
      )}

      {fix && shape === "circle" && (
        <Button tone="plain" className="w-full" onClick={() => setCenter([fix.lat, fix.lng])}>Use my location as the centre</Button>
      )}
      {error && <p role="alert" className="font-semibold text-alarm">{error}</p>}
      <Button tone="ink" className="w-full" disabled={!draft || busy} onClick={save}>
        {busy ? "Saving…" : "Save zone"}
      </Button>
    </div>
  );
}
