/*
    The map used on every screen: lobby preview, zone editor and the in-game view.

    Sections:
    1. Setup (map is built once, markers are kept and updated in place)
    2. Following rules
    3. Layers: zone, me, other dots, drawing draft, reveal pings
    4. Render

    Following rules, in short:
    - "Follow" means the view drifts along when you walk close to the edge. It never touches zoom.
    - Any touch, wheel or pinch on the map switches follow off. Only the recenter button turns it back on.
    - Updates (GPS, syncs) never move a view the player has taken over.

    -- Elias, 2026
*/

"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { LatLng, Zone } from "@/lib/types";

export type MapPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  // 1 = fresh, 0 = stale. Old reveals fade so nobody trusts a minute-old dot.
  fade: number;
  tone: "runner" | "chaser" | "other";
};

type Props = {
  zone: Zone | null;
  me?: { lat: number; lng: number; acc: number } | null;
  points?: MapPoint[];
  // Corners placed so far while drawing a polygon (before it has enough for a shape).
  draft?: LatLng[];
  onTap?: (lat: number, lng: number) => void;
  follow?: boolean;
  // "change": refit whenever the zone changes (viewing). "first": fit once, then only zoom out
  // if the zone outgrows the view (editing, where refitting on every slider tick is maddening).
  fit?: "change" | "first";
  // Changes whenever a new reveal arrives. Each change sends a radar ping out from every dot.
  pingKey?: string | number;
  className?: string;
};

const TILE_URL =
  process.env.NEXT_PUBLIC_TILE_URL ||
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  process.env.NEXT_PUBLIC_TILE_ATTRIBUTION ||
  "&copy; OpenStreetMap contributors";

const TONE_COLOR = {
  runner: "#2f5bff",
  chaser: "#ff5a1f",
  other: "#0f1a2c",
} as const;

export default function LiveMap({
  zone,
  me = null,
  points = [],
  draft = [],
  onTap,
  follow = false,
  fit = "change",
  pingKey,
  className = "",
}: Props) {
  // Setup
  const host = useRef<HTMLDivElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const groups = useRef<Record<string, Leaflet.LayerGroup>>({});
  const [ready, setReady] = useState(false);

  const tapRef = useRef(onTap);
  const zoneRef = useRef(zone);
  const pointsRef = useRef(points);
  const fitRef = useRef(fit);
  useEffect(() => {
    tapRef.current = onTap;
    zoneRef.current = zone;
    pointsRef.current = points;
    fitRef.current = fit;
  });

  // Following rules
  const following = useRef(follow);
  const [followUi, setFollowUi] = useState(follow);
  // True once the view points somewhere meaningful, so a later GPS fix doesn't yank it away.
  const positioned = useRef(false);

  const setFollowing = (on: boolean) => {
    following.current = on;
    setFollowUi(on);
  };

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const mod = await import("leaflet");
      if (cancelled || !host.current) return;
      const lib =
        (mod as unknown as { default?: typeof Leaflet }).default ??
        (mod as typeof Leaflet);
      L.current = lib;
      const m = lib.map(host.current, {
        zoomControl: false,
        attributionControl: true,
        tapTolerance: 20,
      });
      // Placeholder view (all of Europe). It's replaced as soon as there is a zone or a GPS fix.
      m.setView([50, 10], 4);
      lib
        .tileLayer(TILE_URL, {
          maxZoom: 19,
          attribution: TILE_ATTR,
          crossOrigin: true,
        })
        .addTo(m);
      for (const name of ["zone", "draft", "points", "me", "pings"])
        groups.current[name] = lib.layerGroup().addTo(m);
      m.on("click", (ev: Leaflet.LeafletMouseEvent) =>
        tapRef.current?.(ev.latlng.lat, ev.latlng.lng),
      );

      // Listening on the DOM instead of Leaflet's drag/zoom events on purpose: those also fire for
      // our own panTo/setView calls, and a pinch-zoom never fires dragstart.
      const el = m.getContainer();
      const takeOver = () => setFollowing(false);
      const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
      events.forEach((e) =>
        el.addEventListener(e, takeOver, { passive: true }),
      );
      cleanup = () =>
        events.forEach((e) => el.removeEventListener(e, takeOver));

      map.current = m;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      cleanup();
      const m = map.current;
      if (m) {
        m.stop();
        // Leaflet ends an animated zoom with a timer that still fires after remove() and then
        // throws on the dead map (easy to hit: save the zone, press Start straight away).
        // The timer bails out early when this flag is off, so switch it off first.
        (m as unknown as { _animatingZoom: boolean })._animatingZoom = false;
        m.remove();
      }
      map.current = null;
      setReady(false);
    };
  }, []);

  // Layers: zone
  // Keyed on the zone's content. Every sync hands us a new object for the same zone, and
  // redrawing on each of those is what made the map feel like it was resetting.
  const zoneKey = JSON.stringify(zone);
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    const g = groups.current.zone;
    g.clearLayers();
    const z = zoneRef.current;
    if (!z) return;
    const style = {
      color: "#0f1a2c",
      weight: 3,
      dashArray: "8 8",
      fillColor: "#0f1a2c",
      fillOpacity: 0.05,
      interactive: false,
    };
    const shape =
      z.type === "circle"
        ? lib.circle([z.lat, z.lng], { ...style, radius: z.radius })
        : lib.polygon(z.points, style);
    shape.addTo(g);
    const bounds = shape.getBounds();

    if (!positioned.current) {
      m.fitBounds(bounds, { padding: [24, 24], animate: false });
      positioned.current = true;
    } else if (fitRef.current === "change") {
      m.fitBounds(bounds, { padding: [24, 24], animate: true });
    } else if (!m.getBounds().contains(bounds)) {
      // Editing: only make room, never zoom in on the player.
      m.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: m.getZoom(),
        animate: true,
      });
    }
  }, [zoneKey, ready]);

  // Layers: me
  const meRef = useRef<{
    ring: Leaflet.Circle;
    dot: Leaflet.CircleMarker;
  } | null>(null);
  const meLat = me?.lat;
  const meLng = me?.lng;
  const meAcc = me?.acc;
  useEffect(() => {
    const lib = L.current;
    const m = map.current;
    if (!ready || !lib || !m) return;
    if (meLat === undefined || meLng === undefined) {
      groups.current.me.clearLayers();
      meRef.current = null;
      return;
    }
    const pos: Leaflet.LatLngExpression = [meLat, meLng];
    const radius = Math.max(meAcc ?? 0, 3);
    if (!meRef.current) {
      const ring = lib
        .circle(pos, {
          radius,
          color: "#0f1a2c",
          weight: 1,
          fillOpacity: 0.08,
          interactive: false,
        })
        .addTo(groups.current.me);
      const dot = lib
        .circleMarker(pos, {
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#0f1a2c",
          fillOpacity: 1,
          interactive: false,
        })
        .addTo(groups.current.me);
      meRef.current = { ring, dot };
    } else {
      meRef.current.ring.setLatLng(pos).setRadius(radius);
      meRef.current.dot.setLatLng(pos);
    }

    if (!positioned.current) {
      // No zone to look at (zone editor, or the host hasn't drawn one): start where the player is.
      m.setView(pos, 16, { animate: false });
      positioned.current = true;
    } else if (
      follow &&
      following.current &&
      !m.getBounds().pad(-0.35).contains(pos)
    ) {
      m.panTo(pos, { animate: true, duration: 0.5 });
    }
  }, [meLat, meLng, meAcc, follow, ready]);

  // Layers: other dots, updated in place so labels and positions don't flicker
  const dotsRef = useRef<Map<string, Leaflet.CircleMarker>>(new Map());
  useEffect(() => {
    const lib = L.current;
    if (!ready || !lib) return;
    const g = groups.current.points;
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.id);
      const style = {
        radius: 11,
        color: "#ffffff",
        weight: 3,
        fillColor: TONE_COLOR[p.tone],
        fillOpacity: 0.3 + 0.7 * p.fade,
        opacity: 0.4 + 0.6 * p.fade,
      };
      const existing = dotsRef.current.get(p.id);
      if (existing) {
        existing
          .setLatLng([p.lat, p.lng])
          .setStyle(style)
          .setTooltipContent(p.label);
      } else {
        const dot = lib
          .circleMarker([p.lat, p.lng], style)
          .bindTooltip(p.label, {
            permanent: true,
            direction: "top",
            offset: [0, -10],
            className: "zh-tip",
          })
          .addTo(g);
        dotsRef.current.set(p.id, dot);
      }
    }
    for (const [id, dot] of dotsRef.current) {
      if (!seen.has(id)) {
        g.removeLayer(dot);
        dotsRef.current.delete(id);
      }
    }
  }, [points, ready]);

  // Layers: reveal pings
  const lastPing = useRef<string | number | undefined>(pingKey);
  useEffect(() => {
    const lib = L.current;
    if (!ready || !lib) return;
    // The first value we see is "what's already there", not news, so it doesn't ping.
    if (lastPing.current === pingKey) return;
    lastPing.current = pingKey;
    const g = groups.current.pings;
    const made = pointsRef.current.map((p) =>
      lib
        .marker([p.lat, p.lng], {
          interactive: false,
          icon: lib.divIcon({
            className: "zh-ping-host",
            html: `<span class="zh-ping" style="--c:${TONE_COLOR[p.tone]}"></span>`,
            iconSize: [0, 0],
          }),
        })
        .addTo(g),
    );
    const clear = () => made.forEach((mk) => g.removeLayer(mk));
    const t = window.setTimeout(clear, 1800);
    // Runs when a newer reveal arrives or the map goes away, so rings never pile up.
    return () => {
      window.clearTimeout(t);
      clear();
    };
  }, [pingKey, ready]);

  // Layers: polygon corners while drawing
  useEffect(() => {
    const lib = L.current;
    if (!ready || !lib) return;
    const g = groups.current.draft;
    g.clearLayers();
    if (!draft.length) return;
    lib
      .polyline(draft, {
        color: "#0f1a2c",
        weight: 3,
        dashArray: "4 6",
        interactive: false,
      })
      .addTo(g);
    for (const c of draft)
      lib
        .circleMarker(c, {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillColor: "#0f1a2c",
          fillOpacity: 1,
          interactive: false,
        })
        .addTo(g);
  }, [draft, ready]);

  const recenter = () => {
    const m = map.current;
    if (!m || !me) return;
    setFollowing(true);
    m.setView([me.lat, me.lng], Math.max(m.getZoom(), 16), { animate: true });
  };

  const showZone = () => {
    const m = map.current;
    const lib = L.current;
    if (!m || !lib || !zone) return;
    setFollowing(false);
    const b =
      zone.type === "circle"
        ? lib.circle([zone.lat, zone.lng], { radius: zone.radius }).getBounds()
        : lib.polygon(zone.points).getBounds();
    m.fitBounds(b, { padding: [24, 24], animate: true });
  };

  // Render
  return (
    <div className={`relative isolate ${className}`}>
      <div ref={host} className="absolute inset-0" />
      <div className="absolute right-3 top-3 z-[1100] flex flex-col gap-2">
        {me && (
          <button
            onClick={recenter}
            aria-label="Center on me"
            aria-pressed={follow ? followUi : undefined}
            className={`grid size-11 place-items-center rounded-xl shadow-md ring-1 transition active:scale-95 ${
              follow && followUi
                ? "bg-[var(--accent)] text-[var(--accent-ink)] ring-transparent"
                : "bg-paper text-ink ring-ink/15"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="3.5" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          </button>
        )}
        {zone && (
          <button
            onClick={showZone}
            aria-label="Show whole zone"
            className="grid size-11 place-items-center rounded-xl bg-paper text-ink shadow-md ring-1 ring-ink/15 transition active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
