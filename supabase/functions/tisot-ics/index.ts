// טיסות: הזנת יומן (ICS). נרשמים אליה פעם אחת ב-Google Calendar, וכל הזדמנות חדשה מופיעה ביומן לבד.
// כוללת: הטיולים שנשמרו, וההזדמנות הטובה ביותר לכל יעד (לפחות 25% מתחת לחציון של היעד).
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const APP = "https://tisot-gh.vercel.app";
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const ymd = (d: string) => d.replaceAll("-", "");
const next = (d: string) => new Date(new Date(d + "T00:00:00Z").getTime() + 864e5).toISOString().slice(0, 10);

function event(uid: string, title: string, out: string, back: string, desc: string, where: string) {
  return ["BEGIN:VEVENT", `UID:${uid}@tisot`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${ymd(out)}`, `DTEND;VALUE=DATE:${ymd(next(back))}`, `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(desc)}`, `LOCATION:${esc(where)}`, "TRANSP:TRANSPARENT", "END:VEVENT"].join("\r\n");
}

Deno.serve(async () => {
  const { data: board } = await db.rpc("tisot_board");
  const dests: any[] = board?.dests ?? [];
  const by = new Map(dests.map((d) => [d.code, d]));
  const ev: string[] = [];
  for (const t of board?.trips ?? []) {
    const d = by.get(t.dest);
    ev.push(event("trip-" + t.id, `טיול: ${d?.he ?? t.dest}${t.price ? " · " + Math.round(t.price) + " ₪" : ""}`, t.out_day, t.back_day,
      `הטיול ששמרת. המסלול, המפה והלינה: ${APP}/#/t/${t.dest}/${t.out_day}/${t.back_day}`, `${d?.he ?? ""}, ${d?.country ?? ""}`));
  }
  const opps = dests.filter((d) => d.med && d.deals?.length)
    .map((d) => ({ d, deal: d.deals[0], off: 1 - d.deals[0].p / d.med }))
    .filter((o) => o.off >= 0.25).sort((a, b) => b.off - a.off).slice(0, 12);
  for (const o of opps) {
    ev.push(event(`opp-${o.d.code}-${o.deal.out}`, `הזדמנות: ${o.d.he} · ${Math.round(o.deal.p)} ₪`, o.deal.out, o.deal.back,
      `${Math.round(o.off * 100)}% מתחת למחיר הרגיל ליעד (${Math.round(o.d.med)} ₪). ${o.deal.n} לילות. המחיר משתנה, בודקים לפני הזמנה. לפתיחה: ${APP}/#/t/${o.d.code}/${o.deal.out}/${o.deal.back}`,
      `${o.d.he}, ${o.d.country}`));
  }
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//tisot//he", "CALSCALE:GREGORIAN", "X-WR-CALNAME:טיסות: הזדמנויות", "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H", ...ev, "END:VCALENDAR"].join("\r\n");
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "public, max-age=900", "access-control-allow-origin": "*" } });
});
