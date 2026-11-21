import { useEffect, useMemo, useState } from "react";
import { loadGuide, removeTrip, saveTrip, type Board, type Guide } from "./api";
import LMap, { type Pin } from "./LMap";
import { MonthBars } from "./Home";
import { bookingUrl, daysUntil, flightsUrl, gcalUrl, ils, mapsRouteUrl, nights as nightsOf, range, tripHash } from "./util";

type Tab = "days" | "places" | "stay" | "food";
type Props = { board: Board; code: string; out?: string; back?: string; onSaved: () => void };

export default function TripPage({ board, code, out, back, onSaved }: Props) {
  const dest = board.dests.find((d) => d.code === code);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [gState, setGState] = useState<"load" | "none" | "writing" | "ok" | "err">("load");
  const [gErr, setGErr] = useState("");
  const [day, setDay] = useState(0);
  const [tab, setTab] = useState<Tab>("days");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dead = false;
    setGuide(null); setGState("load"); setDay(0);
    // קודם מדריך שמור. אם אין, המדריך המקומי כותב אחד עכשיו, והוא נשמר לכולם.
    loadGuide(code, false).then(async (g) => {
      if (dead) return;
      if (g) { setGuide(g); setGState("ok"); return; }
      setGState("writing");
      const made = await loadGuide(code, true);
      if (!dead) { setGuide(made); setGState(made ? "ok" : "none"); }
    }).catch((e) => { if (!dead) { setGErr(String(e.message ?? e)); setGState("err"); } });
    return () => { dead = true; };
  }, [code]);

  const deal = dest?.deals.find((d) => d.out === out && d.back === back) ?? null;
  const o = out ?? dest?.deals[0]?.out, b = back ?? dest?.deals[0]?.back;
  const n = o && b ? nightsOf(o, b) : 3;
  const price = deal?.p ?? null;
  const off = dest?.med && price ? 1 - price / dest.med : null;
  const saved = board.trips.find((t) => t.dest === code && t.out_day === o && t.back_day === b);
  const days = guide ? guide.days.slice(0, Math.min(guide.days.length, n + 1)) : [];
  const place = (id: number) => guide?.places.find((p) => p.id === id);

  const { pins, lines } = useMemo(() => {
    if (!guide) return { pins: [] as Pin[], lines: [] as [number, number][][] };
    if (tab === "stay") return { lines: [], pins: guide.stay.map((s) => ({ lat: s.lat, lng: s.lng, label: s.area, cls: "stay" })) };
    if (tab === "days" && days[day]) {
      const stops = days[day].stops.map((s) => place(s.place)).filter(Boolean) as Guide["places"];
      const on = new Set(stops.map((p) => p.id));
      return {
        lines: [stops.map((p) => [p.lat, p.lng] as [number, number])],
        pins: [
          ...guide.places.filter((p) => !on.has(p.id)).map((p) => ({ lat: p.lat, lng: p.lng, label: "", cls: "dim", title: p.name })),
          ...stops.map((p, i) => ({ lat: p.lat, lng: p.lng, label: `<b>${i + 1}</b> ${p.name}`, cls: "stop", title: p.name })),
        ],
      };
    }
    const list = tab === "food" ? guide.places.filter((p) => p.kind === "אוכל") : guide.places;
    return { lines: [], pins: list.map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, cls: p.kind === "סמוי" ? "hidden-gem" : "", title: p.why })) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, tab, day, n]);

  if (!dest) return <p className="empty">היעד לא נמצא ברשימה.</p>;
  if (!o || !b) return <p className="empty">עוד אין מחירים ל{dest.he}. הרדאר יגיע אליו בסריקה הקרובה.</p>;

  const toggleSave = async () => {
    setBusy(true);
    try { saved ? await removeTrip(saved.id) : await saveTrip(code, o, b, price); onSaved(); } finally { setBusy(false); }
  };
  const others = dest.deals.filter((d) => !(d.out === o && d.back === b)).slice(0, 6);

  return (
    <div className="trip">
      <section className="t-side">
        <p className="kicker mono">{dest.country} · בעוד {daysUntil(o)} ימים</p>
        <h1 className="city">{dest.he}</h1>
        <p className="where">{range(o, b)} · {n} לילות</p>
        <div className="price-row">
          {price ? <span className="price mono">{ils(price)}<small> ₪</small></span> : <span className="where">אין מחיר שמור לתאריכים האלה</span>}
          {off != null && <span className="vs"><b className={off >= 0.1 ? "off" : ""}>{off > 0 ? `${Math.round(off * 100)}% מתחת לרגיל` : "מחיר רגיל"}</b><span className="mono">בדרך כלל {ils(dest.med)} ₪</span></span>}
        </div>
        <div className="actions">
          <a className="btn primary press" href={flightsUrl(dest, o, b)} target="_blank" rel="noreferrer">לטיסה ב-Google Flights</a>
          <a className="btn press" href={bookingUrl(dest.en, o, b)} target="_blank" rel="noreferrer">לינה ב-Booking</a>
          <a className="btn press" href={gcalUrl(dest, o, b, price)} target="_blank" rel="noreferrer">ליומן</a>
          <button className="btn press" aria-pressed={!!saved} disabled={busy} onClick={toggleSave}>{saved ? "נשמר בטיולים שלי" : "לשמור טיול"}</button>
        </div>
        {others.length > 0 && (
          <div className="others">
            <span className="lbl mono">תאריכים אחרים</span>
            {others.map((d) => <a key={d.out + d.n} className="chip press mono" href={tripHash(code, d.out, d.back)}>{range(d.out, d.back)} · {ils(d.p)}</a>)}
          </div>
        )}
        <MonthBars dest={dest} pick={(x, y) => (location.hash = tripHash(code, x, y))} />
      </section>

      <section className="t-guide">
        {gState !== "ok" || !guide ? (
          <p className="empty">
            {gState === "writing" ? `המדריך המקומי של ${dest.he} כותב עכשיו את המסלול. זה לוקח כחצי דקה, ונשמר לפעם הבאה.`
              : gState === "err" ? `המדריך לא זמין כרגע (${gErr}). הטיסה, הלינה והיומן עובדים כרגיל.` : "טוען את המדריך..."}
          </p>
        ) : (
          <>
            <blockquote className="quote">
              <p className="tagline">{guide.tagline}</p>
              <p>{guide.intro}</p>
              <cite className="mono">{guide.guide_name}, המדריך המקומי · נכתב בעזרת AI, כדאי לאמת שעות פתיחה</cite>
            </blockquote>
            <div className="tabs" role="tablist">
              {([["days", "מסלול"], ["places", "מקומות"], ["stay", "איפה לישון"], ["food", "אוכל וטיפים"]] as const).map(([k, t]) => (
                <button key={k} role="tab" className="chip press" aria-pressed={tab === k} onClick={() => setTab(k)}>{t}</button>
              ))}
            </div>

            {tab === "days" && (
              <div className="pane">
                <div className="daybar">
                  {days.map((d, i) => <button key={i} className="chip press mono" aria-pressed={day === i} onClick={() => setDay(i)}>יום {i + 1}</button>)}
                </div>
                {days[day] && (
                  <>
                    <h2>{days[day].title.replace(/^יום \d+[:.]?\s*/, "")}</h2>
                    <ol className="stops">
                      {days[day].stops.map((s, i) => (
                        <li key={i}>
                          <span className="num mono">{i + 1}</span>
                          <div><b>{place(s.place)?.name}</b> <span className="when mono">{s.when} · כ-{place(s.place)?.mins} דק'</span><p>{s.note}</p></div>
                        </li>
                      ))}
                    </ol>
                    <a className="btn press" target="_blank" rel="noreferrer"
                      href={mapsRouteUrl(days[day].stops.map((s) => place(s.place)!).filter(Boolean))}>מסלול הליכה ב-Google Maps</a>
                  </>
                )}
              </div>
            )}
            {tab === "places" && (
              <ul className="pane list">
                {guide.places.map((p) => (
                  <li key={p.id}><span className={`tag mono k-${p.kind}`}>{p.kind}</span><div><b>{p.name}</b> <span className="when mono">{p.local}</span><p>{p.why}</p></div></li>
                ))}
              </ul>
            )}
            {tab === "stay" && (
              <ul className="pane list">
                {guide.stay.map((s) => (
                  <li key={s.area}><div><b>{s.area}</b><p>{s.why}</p></div>
                    <a className="btn press" href={bookingUrl(`${s.area}, ${dest.en}`, o, b)} target="_blank" rel="noreferrer">לינה באזור</a></li>
                ))}
                <li><div><b>מהשדה למרכז</b><p>{guide.airport}</p></div></li>
              </ul>
            )}
            {tab === "food" && (
              <ul className="pane list">
                {guide.food.map((f) => <li key={f.dish}><span className="tag mono k-אוכל">מנה</span><div><b>{f.dish}</b><p>{f.where}</p></div></li>)}
                {guide.tips.map((t, i) => <li key={i}><span className="tag mono">טיפ</span><div><p>{t}</p></div></li>)}
              </ul>
            )}
          </>
        )}
      </section>

      <LMap pins={pins.length ? pins : [{ lat: dest.lat, lng: dest.lng, label: dest.he }]} lines={lines} fitKey={`${code}-${tab}-${day}-${pins.length}`} className="t-map" />
    </div>
  );
}
