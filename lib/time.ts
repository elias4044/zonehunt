// 75_000 -> "1:15", 3_725_000 -> "1:02:05". Negative values clamp to zero.
export function clock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function ago(ms: number) {
  if (ms < 5000) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
