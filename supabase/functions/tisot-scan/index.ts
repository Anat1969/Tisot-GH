// טיסות: סורק חלק אחד מלוח המחירים הציבורי של Google Flights בכל הרצה (pg_cron, כל 3 דקות).
// אם גוגל מבקש הפסקה: עוצרים ל-12 דקות ומעבירים את החלק לסוף התור. לא מנסים לעקוף.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const ORIGIN = "TLV";
const PAUSE_MIN = 12;
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

class Blocked extends Error {}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

function seg(o: string, d: string, day: string) {
  return [[[[o, 0]]], [[[d, 0]]], null, 0, null, null, day, null, null, null, null, null, null, null, 3];
}

async function calendar(dest: string, start: Date, end: Date, nights: number) {
  const filters = [null, null, 1, null, [], 1, [1, 0, 0, 0], null, null, null, null, null, null,
    [seg(ORIGIN, dest, iso(start)), seg(dest, ORIGIN, iso(addDays(start, nights)))], null, null, null, 1];
  const inner = [null, filters, [iso(start), iso(end)], null, [nights, nights]];
  const body = "f.req=" + encodeURIComponent(JSON.stringify([null, JSON.stringify(inner)]));
  const r = await fetch(`${BASE}GetCalendarGraph?curr=ILS&hl=en`, {
    method: "POST", redirect: "manual", body,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": UA },
  });
  if (r.status === 429 || (r.status >= 300 && r.status < 400)) throw new Blocked("status " + r.status);
  if (!r.ok) throw new Error("status " + r.status);
  let raw = (await r.text()).trimStart();
  if (raw.startsWith(")]}'")) raw = raw.slice(4);
  let data: any = null;
  for (const line of raw.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("[")) continue;
    let outer: any;
    try { outer = JSON.parse(l); } catch { continue; }
    for (const item of outer) {
      if (Array.isArray(item) && item[0] === "wrb.fr") {
        if (item[2] == null) {
          const code = item[5]?.[0];
          if (code === 13 || code === 7 || code === 8) throw new Blocked("code " + code);
          return [];
        }
        data = JSON.parse(item[2]);
      }
    }
    if (data) break;
  }
  const out: { out: string; back: string; price: number }[] = [];
  const list = data?.[data.length - 1];
  if (!Array.isArray(list)) return out;
  for (const it of list) {
    const price = Number(it?.[2]?.[0]?.[1]);
    if (it?.[0] && it?.[1] && price > 0) out.push({ out: it[0], back: it[1], price });
  }
  return out;
}

Deno.serve(async (req) => {
  const max = Math.min(Number(new URL(req.url).searchParams.get("n") ?? 1), 3);
  const now = new Date();
  const { data: st } = await db.from("tisot_state").select("*").eq("id", 1).single();
  if (st?.blocked_until && new Date(st.blocked_until) > now) {
    return Response.json({ skipped: "blocked", until: st.blocked_until });
  }
  const { data: chunks } = await db.from("tisot_chunks").select("*")
    .order("scanned_at", { ascending: true, nullsFirst: true }).order("idx").order("nights").order("dest").limit(max);
  const today = new Date(iso(now) + "T00:00:00Z");
  const done: unknown[] = [];
  let note = "ok";
  let blocked = false;
  for (const c of chunks ?? []) {
    const start = addDays(today, 1 + c.idx * 61);
    const last = addDays(today, 329 - c.nights);
    let end = addDays(start, 60);
    if (end > last) end = last;
    let rows: { out: string; back: string; price: number }[] = [];
    let state = "ok";
    try {
      if (start <= last) rows = await calendar(c.dest, start, end, c.nights);
    } catch (e) {
      if (e instanceof Blocked) {
        // בחלק האחרון קוד 13 הוא לרוב סוף הטווח שגוגל מוכר, לא חסימה
        if (c.idx >= 4) state = "end";
        else { state = "blocked"; blocked = true; note = `blocked: ${e.message} (${c.dest})`; }
      } else { state = "error"; note = String(e); }
    }
    if (state === "ok") {
      await db.from("tisot_prices").delete().eq("dest", c.dest).eq("nights", c.nights).gte("out_day", iso(start)).lte("out_day", iso(end));
      if (rows.length) {
        await db.from("tisot_prices").upsert(rows.map((r) => ({ dest: c.dest, nights: c.nights, out_day: r.out, back_day: r.back, price: r.price, scanned_at: now.toISOString() })));
      }
    }
    await db.from("tisot_chunks").update({ scanned_at: new Date().toISOString(), rows: rows.length, state }).eq("dest", c.dest).eq("nights", c.nights).eq("idx", c.idx);
    done.push({ dest: c.dest, nights: c.nights, idx: c.idx, rows: rows.length, state });
    if (blocked) break;
    if (max > 1) await new Promise((r) => setTimeout(r, 4000));
  }
  await db.from("tisot_prices").delete().lte("out_day", iso(today));
  await db.from("tisot_state").update({
    last_run: now.toISOString(), last_note: note,
    blocked_until: blocked ? new Date(now.getTime() + PAUSE_MIN * 6e4).toISOString() : null,
  }).eq("id", 1);
  return Response.json({ done, blocked });
});
