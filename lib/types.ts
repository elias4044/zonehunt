// Do I even need to explain what this file does?

export type Role = "none" | "chaser" | "runner" | "referee";
export type GameStatus = "lobby" | "active" | "paused" | "ended";
export type LatLng = [number, number];

export type Zone =
  | { type: "circle"; lat: number; lng: number; radius: number }
  | { type: "polygon"; points: LatLng[] };

export interface Game {
  id: string;
  code: string;
  host: string;
  status: GameStatus;
  winner: "" | "chasers" | "runners" | "none";
  zone: Zone | null;
  duration_s: number;
  reveal_interval_s: number;
  head_start_s: number;
  catch_radius_m: number;
  compass_range_m: number;
  max_players: number;
  powerups: boolean;
  started_at: number;
  chase_starts_at: number;
  ends_at: number;
  paused_at: number;
  next_reveal_at: number;
  ended_at: number;
  reveal_seq: number;
}

export interface Me {
  id: string;
  role: Role;
  status: "free" | "caught";
  ready: boolean;
  catch_code: string;
  catch_lock_until: number;
  stealth_until: number;
  stealth_ready_at: number;
  scan_ready_at: number;
  outside: boolean | null;
  has_fix: boolean;
}

export interface PlayerRow {
  id: string;
  name: string;
  role: Role;
  status: "free" | "caught";
  ready: boolean;
  seen: number;
}

export interface RevealPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

export interface Reveal {
  seq: number;
  at: number;
  kind: "timed" | "scan";
  points: RevealPoint[];
}

export interface CompassReading {
  bearing: number;
  distance: number;
  count: number;
}

export interface FeedEvent {
  id: string;
  at: number;
  kind: string;
  text: string;
}

export interface LivePoint {
  id: string;
  lat: number;
  lng: number;
  acc: number;
  t: number;
}

export interface SyncResponse {
  now: number;
  game: Game;
  me: Me;
  players: PlayerRow[];
  compass: CompassReading | null;
  reveal: Reveal | null;
  live: LivePoint[] | null;
  events: FeedEvent[];
}

export interface Session {
  token: string;
  player: { id: string; name: string };
  game: Game;
}

export interface Fix {
  lat: number;
  lng: number;
  acc: number;
  ts: number;
}
