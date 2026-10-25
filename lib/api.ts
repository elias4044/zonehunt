import PocketBase, { ClientResponseError } from "pocketbase";
import type { Fix, Game, Role, Session, SyncResponse, Zone } from "./types";

// Same origin in production (PocketBase serves the built app). In dev, .env.local points at it.
const base =
  process.env.NEXT_PUBLIC_PB_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8090");

export const pb = new PocketBase(base);
pb.autoCancellation(false);

export class ApiFailure extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  // status 0 means the request never got an answer: offline, tunnel down, server restarting.
  get network() {
    return this.status === 0;
  }
}

function toFailure(err: unknown): ApiFailure {
  if (err instanceof ClientResponseError) {
    const data = err.response?.data as { reason?: { code?: string } } | undefined;
    const code = data?.reason?.code ?? (err.status === 0 ? "network" : "error");
    const message =
      err.status === 0
        ? "Can't reach the server. Check your connection."
        : (err.response?.message as string) || "Something went wrong.";
    return new ApiFailure(err.status, code, message);
  }
  return new ApiFailure(0, "network", "Can't reach the server. Check your connection.");
}

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  try {
    return await pb.send<T>(`/api/mh/${path}`, { method: "POST", body: body as object });
  } catch (err) {
    throw toFailure(err);
  }
}

function adopt(session: Session): Session {
  // The SDK wants a record next to the token. We stash the game id on it too, so a page
  // reload knows which game to subscribe to before the first sync comes back.
  pb.authStore.save(session.token, {
    id: session.player.id,
    collectionId: "players",
    collectionName: "players",
    game: session.game.id,
  });
  return session;
}

export const api = {
  createGame: async (name: string, cfg: Partial<Game> = {}) =>
    adopt(await post<Session>("games", { name, ...cfg })),
  joinGame: async (code: string, name: string) =>
    adopt(await post<Session>("join", { code, name })),
  sync: (fix: Fix | null, revealSeq: number, eventAt: number) =>
    post<SyncResponse>("sync", {
      ...(fix ? { lat: fix.lat, lng: fix.lng, acc: fix.acc, ts: fix.ts } : {}),
      reveal_seq: revealSeq,
      event_at: eventAt,
    }),
  config: (patch: Partial<Game> & { zone?: Zone | null }) => post<{ game: Game }>("config", patch),
  role: (role: Role, player?: string) => post("role", { role, player }),
  randomize: (chasers: number) => post("randomize", { chasers }),
  ready: (ready: boolean) => post("ready", { ready }),
  start: () => post("start"),
  catchRunner: (code: string) =>
    post<{ caught: { id: string; name: string }; remaining: number }>("catch", { code }),
  powerup: (type: "scan" | "stealth") => post("powerup", { type }),
  pause: (paused: boolean) => post("pause", { paused }),
  end: () => post("end"),
  leave: (player?: string) => post("leave", { player }),
};

export function hasToken() {
  return pb.authStore.isValid && !!pb.authStore.token;
}

export function dropSession() {
  pb.authStore.clear();
}
