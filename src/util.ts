import type { Board, Deal, Dest } from "./api";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
export const MONTHS = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
const d = (s: string) => new Date(s + "T12:00:00");

export const dayName = (s: string) => DAYS[d(s).getDay()];
export const shortDate = (s: string) => `${d(s).getDate()}.${d(s).getMonth() + 1}`;
export const range = (out: string, back: string) => `${dayName(out)} ${shortDate(out)} עד ${dayName(back)} ${shortDate(back)}`;
export const daysUntil = (s: string) => Math.round((d(s).getTime() - Date.now()) / 864e5);
export const nights = (out: string, back: string) => Math.round((d(back).getTime() - d(out).getTime()) / 864e5);
export const ils = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("he-IL"));
export const addDays = (s: string, n: number) => new Date(d(s).getTime() + n * 864e5).toISOString().slice(0, 10);

export function ago(iso: string | null | undefined) {
  if (!iso) return "עוד לא";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
  if (m < 2) return "עכשיו";
  if (m < 60) return `לפני ${m} דקות`;
  if (m < 48 * 60) return `לפני ${Math.round(m / 60)} שעות`;
  return `לפני ${Math.round(m / 1440)} ימים`;
}

/** סופ"ש: הטיול כולל גם שישי וגם שבת */
export function hasWeekend(out: string, back: string) {
  let fri = false, sat = false;
  for (let i = 0, n = nights(out, back); i <= n; i++) {
    const w = d(addDays(out, i)).getDay();
    if (w === 5) fri = true;
    if (w === 6) sat = true;
  }
  return fri && sat;
}

export type Filter = { nights: number[]; when: "all" | "soon" | "weekend" };
export type Opp = { dest: Dest; deal: Deal; off: number; soon: boolean; score: number };

/** הזדמנות = מחיר נמוך מהחציון של אותו יעד. יציאה ב-60 הימים הקרובים מקבלת עדיפות קלה: החלטה של רגע. */
export function opportunities(board: Board, f: Filter): Opp[] {
  const out: Opp[] = [];
  for (const dest of board.dests) {
    if (!dest.med || !dest.deals.length) continue;
    let best: Opp | null = null;
    for (const deal of dest.deals) {
      if (!f.nights.includes(deal.n)) continue;
      const until = daysUntil(deal.out);
      if (until < 1) continue;
      if (f.when === "soon" && until > 60) continue;
      if (f.when === "weekend" && !hasWeekend(deal.out, deal.back)) continue;
      const off = 1 - deal.p / dest.med;
      const soon = until <= 60;
      const score = off + (soon ? 0.08 : 0);
      if (!best || score > best.score) best = { dest, deal, off, soon, score };
    }
    if (best) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

export const tripHash = (code: string, out: string, back: string) => `#/t/${code}/${out}/${back}`;

export const flightsUrl = (dest: Dest, out: string, back: string) =>
  `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${dest.code} from TLV on ${out} through ${back}`)}&curr=ILS&hl=he`;

export const bookingUrl = (place: string, out: string, back: string) =>
  `https://www.booking.com/searchresults.he.html?ss=${encodeURIComponent(place)}&checkin=${out}&checkout=${back}&group_adults=2&no_rooms=1&selected_currency=ILS`;

export function gcalUrl(dest: Dest, out: string, back: string, price: number | null) {
  const ymd = (s: string) => s.replaceAll("-", "");
  const details = `טיסה הלוך-חזור מתל אביב${price ? `, ${ils(price)} ₪ בשעת הבדיקה` : ""}.\nהמסלול, המפה והלינה: ${location.origin}/${tripHash(dest.code, out, back)}`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`טיול: ${dest.he}`)}` +
    `&dates=${ymd(out)}/${ymd(addDays(back, 1))}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(`${dest.en}`)}`;
}

export const mapsRouteUrl = (pts: { lat: number; lng: number }[]) =>
  `https://www.google.com/maps/dir/${pts.map((p) => `${p.lat},${p.lng}`).join("/")}/data=!4m2!4m1!3e2`;
