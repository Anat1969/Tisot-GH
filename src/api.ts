// מקור נתונים אחד: לוח ההזדמנויות מהענן. כל מסך נגזר ממנו.
const URL_ = "https://ktqmwpbzcnzkhjskqisy.supabase.co";
const KEY = "sb_publishable_IkreG7naPa1h-d4kGp1gpA_sLU4tg5q"; // מפתח ציבורי לקריאה בלבד
export const ICS_URL = `${URL_}/functions/v1/tisot-ics`;

export type Deal = { out: string; back: string; n: number; p: number };
export type Dest = {
  code: string; he: string; en: string; country: string; lat: number; lng: number; active: boolean;
  lo: number | null; av: number | null; med: number | null; hi: number | null; n: number | null; seen: string | null;
  deals: Deal[];
};
export type Trip = { id: string; dest: string; out_day: string; back_day: string; price: number | null };
export type Board = {
  now: string; total: number;
  state: { blocked_until: string | null; last_run: string | null; last_note: string | null } | null;
  dests: Dest[]; trips: Trip[];
};
export type Place = { id: number; name: string; local: string; kind: string; why: string; lat: number; lng: number; mins: number };
export type Guide = {
  guide_name: string; tagline: string; intro: string; airport: string;
  stay: { area: string; why: string; lat: number; lng: number }[];
  places: Place[];
  days: { title: string; stops: { place: number; when: string; note: string }[] }[];
  food: { dish: string; where: string }[];
  tips: string[];
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: KEY, "content-type": "application/json" }, body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.message ?? "שגיאת רשת");
  return r.json();
}

const CACHE = "tisot.board";
export function cachedBoard(): Board | null {
  try { return JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch { return null; }
}
export async function loadBoard(): Promise<Board> {
  const b = await rpc<Board>("tisot_board");
  try { localStorage.setItem(CACHE, JSON.stringify(b)); } catch { /* מכשיר בלי אחסון */ }
  return b;
}
export const loadCal = (dest: string) => rpc<[string, number, number][]>("tisot_cal", { p_dest: dest });
export const saveTrip = (dest: string, out: string, back: string, price: number | null) =>
  rpc<string>("tisot_save_trip", { p_dest: dest, p_out: out, p_back: back, p_price: price });
export const removeTrip = (id: string) => rpc<void>("tisot_remove_trip", { p_id: id });
export const watch = (dest: string, on: boolean) => rpc<boolean>("tisot_watch", { p_dest: dest, p_on: on });

export async function loadGuide(dest: string, create: boolean): Promise<Guide | null> {
  const r = await fetch(`${URL_}/functions/v1/tisot-guide${create ? "" : `?dest=${dest}`}`, create
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dest }) }
    : undefined);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.guide;
}
