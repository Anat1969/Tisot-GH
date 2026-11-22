import { useEffect, useMemo, useState } from "react";
import { loadGuide, removeTrip, saveTrip, type Board, type Guide, type Place } from "./api";
import Map3D, { type Pin } from "./Map3D";
import Calendar from "./Calendar";
import { thumb, usePlaceImages } from "./images";
import { bookingUrl, daysUntil, flightsUrl, gcalUrl, ils, mapsRouteUrl, nights as nightsOf, range, shortDate, dayName, addDays, tripHash } from "./util";

type Tab = "days" | "dates" | "places" | "stay" | "food";
type Props = { board: Board; code: string; out?: string; back?: string; onSaved: () => void };
const TABS: [Tab, string][] = [["days", "מסלול"], ["dates", "תאריכים"], ["places", "מקומות"], ["stay", "לינה"], ["food", "אוכל וטיפים"]];

export default function TripPage({ board, code, out, back, onSaved }: Props) {
  const dest = board.dests.find((d) => d.code === code);
  const [guide, setGuide] = useState<Guide | null>(null);
  const [gState, setGState] = useState<"load" | "writing" | "ok" | "err">("load");
  const [gErr, setGErr] = useState("");
  const [day, setDay] = useState(0);
  const [tab, setTab] = useState<Tab>("days");
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const imgs = usePlaceImages(code, dest?.en ?? "", guide);

  useEffect(() => {
    let dead = false;
    setGuide(null); setGState("load"); setDay(0); setFocus(null);
    // קודם מדריך שמור. אם אין, המדריך המקומי כותב אחד עכשיו, והוא נשמר לכולם.
    loadGuide(code, false).then(async (g) => {
      if (dead) return;
      if (g) { setGuide(g); setGState("ok"); return; }
      setGState("writing");
      const made = await loadGuide(code, true);
      if (!dead && made) { setGuide(made); setGState("ok"); }
    }).catch((e) => { if (!dead) { setGErr(String(e.message ?? e)); setGState("err"); } });
    return () => { dead = true; };
  }, [code]);

  const deal = dest?.deals.find((d) => d.out === out && d.back === back) ?? null;
  const o = out ?? dest?.deals[0]?.out, b = back ?? dest?.deals[0]?.back;
  const n = o && b ? nightsOf(o, b) : 3;
  const price = deal?.p ?? picked;
  const off = dest?.med && price ? 1 - price / dest.med : null;
  const saved = board.trips.find((t) => t.dest === code && t.out_day === o && t.back_day === b);
  const days = guide ? guide.days.slice(0, Math.min(guide.days.length, n + 1)) : [];
  const place = (id: number) => guide?.places.find((p) => p.id === id);
  const stops = (days[day]?.stops.map((s) => place(s.place)).filter(Boolean) ?? []) as Place[];

  const { pins, lines } = useMemo(() => {
    if (!guide) return { pins: [] as Pin[], lines: [] as [number, number][][] };
    const pin = (p: Place, badge?: string): Pin => ({ id: `p${p.id}`, lat: p.lat, lng: p.lng, label: p.name, img: thumb(imgs[p.id], 120), badge, cls: p.kind === "סמוי" ? "gem" : "" });
    if (tab === "stay") return { lines: [], pins: guide.stay.map((s, i) => ({ id: `s${i}`, lat: s.lat, lng: s.lng, label: s.area, cls: "stay" })) };
    if (tab === "days" && stops.length) {
      const on = new Set(stops.map((p) => p.id));
      return {
        lines: [stops.map((p) => [p.lat, p.lng] as [number, number])],
        pins: [...guide.places.filter((p) => !on.has(p.id)).map((p) => ({ ...pin(p), cls: "dim" })), ...stops.map((p, i) => pin(p, String(i + 1)))],
      };
    }
    return { lines: [], pins: (tab === "food" ? guide.places.filter((p) => p.kind === "אוכל") : guide.places).map((p) => pin(p)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide, tab, day, n, imgs]);

  if (!dest) return <p className="empty">היעד לא נמצא ברשימה.</p>;
  if (!o || !b) return <p className="empty">עוד אין מחירים ל{dest.he}. הרדאר יגיע אליו בסריקה הקרובה.</p>;

  const toggleSave = async () => {
    setBusy(true);
    try { saved ? await removeTrip(saved.id) : await saveTrip(code, o, b, price); onSaved(); } finally { setBusy(false); }
  };
  const Photo = ({ p, w = 250 }: { p: Place; w?: number }) => imgs[p.id]
    ? <img className="ph" src={thumb(imgs[p.id], w)} alt={p.name} loading="lazy" />
    : <span className={`ph none k-${p.kind}`} aria-hidden="true">{p.name.slice(0, 1)}</span>;
  const fitKey = `${code}-${tab}-${tab === "days" ? day : ""}-${pins.length}`;

  return (
    <div className="trip">
      <section className="t-panel">
        <header className="t-hero" style={dest.img ? { backgroundImage: `url('${thumb(dest.img, 960)}')` } : undefined}>
          <div className="scrim">
            <p className="kicker mono">{dest.country} · בעוד {daysUntil(o)} ימים</p>
            <h1 className="city">{dest.he}</h1>
            <p className="where">{range(o, b)} · {n} לילות</p>
            <div className="price-row">
              {price ? <span className="price mono">{ils(price)}<small> ₪</small></span> : null}
              {off != null && <span className="vs"><b className={off >= 0.1 ? "off" : ""}>{off > 0 ? `${Math.round(off * 100)}% מתחת לרגיל` : "מחיר רגיל"}</b><span className="mono">בדרך כלל {ils(dest.med)} ₪</span></span>}
            </div>
          </div>
        </header>

        <div className="actions">
          <a className="btn primary press" href={flightsUrl(dest, o, b)} target="_blank" rel="noreferrer">טיסה ב-Google Flights</a>
          <a className="btn press" href={bookingUrl(dest.en, o, b)} target="_blank" rel="noreferrer">לינה ב-Booking</a>
          <a className="btn press" href={gcalUrl(dest, o, b, price)} target="_blank" rel="noreferrer">ליומן</a>
          <button className="btn press" aria-pressed={!!saved} disabled={busy} onClick={toggleSave}>{saved ? "נשמר" : "לשמור"}</button>
        </div>

        {/* ציר הזמן של הטיול: מהיום, דרך כל יום בטיול, ועד החזרה */}
        <ol className="axis" aria-label="ציר הטיול">
          <li className="past"><span className="mono">היום</span></li>
          {Array.from({ length: n + 1 }, (_, i) => {
            const d = addDays(o, i), has = i < days.length;
            return (
              <li key={d} className={tab === "days" && day === i ? "on" : ""}>
                <button disabled={!has} onClick={() => { setTab("days"); setDay(i); setFocus(null); }}>
                  <b className="mono">{shortDate(d)}</b><span>{dayName(d)}</span><small>{i === 0 ? "המראה" : i === n ? "חזרה" : `יום ${i + 1}`}</small>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="tabs" role="tablist">
          {TABS.map(([k, t]) => <button key={k} role="tab" className="chip press" aria-pressed={tab === k} onClick={() => { setTab(k); setFocus(null); }}>{t}</button>)}
        </div>

        <div className="t-body">
          {tab === "dates" ? (
            <Calendar dest={code} out={o} nights={n} onPick={(x, y, p) => { setPicked(p); location.hash = tripHash(code, x, y); }} />
          ) : gState !== "ok" || !guide ? (
            <p className="empty">
              {gState === "writing" ? `המדריך המקומי של ${dest.he} כותב עכשיו את המסלול. זה לוקח כחצי דקה, ונשמר לפעם הבאה.`
                : gState === "err" ? `המדריך לא זמין כרגע (${gErr}). הטיסה, הלינה, התאריכים והיומן עובדים כרגיל.` : "טוען את המדריך..."}
            </p>
          ) : tab === "days" ? (
            <>
              <blockquote className="quote">
                <p className="tagline">{guide.tagline}</p>
                <p>{guide.intro}</p>
                <cite className="mono">{guide.guide_name}, המדריך המקומי · נכתב בעזרת AI, כדאי לאמת שעות פתיחה</cite>
              </blockquote>
              {days[day] && (
                <>
                  <h2><span className="mono">יום {day + 1}</span>{days[day].title.replace(/^יום \d+[:.]?\s*/, "")}</h2>
                  <ol className="tl">
                    {days[day].stops.map((s, i) => {
                      const p = place(s.place);
                      return p && (
                        <li key={i}>
                          <button className={`card press ${focus === `p${p.id}` ? "on" : ""}`} onClick={() => setFocus(`p${p.id}`)}>
                            <span className="tl-when mono"><em>{i + 1}</em>{s.when}</span>
                            <Photo p={p} />
                            <span className="tx"><b>{p.name}</b><small className="mono">{p.local} · כ-{p.mins} דק'</small><span>{s.note}</span></span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                  <a className="btn press" target="_blank" rel="noreferrer" href={mapsRouteUrl(stops)}>מסלול הליכה ב-Google Maps</a>
                </>
              )}
            </>
          ) : tab === "places" ? (
            <ul className="gallery">
              {guide.places.map((p) => (
                <li key={p.id}>
                  <button className={`tile press ${focus === `p${p.id}` ? "on" : ""}`} onClick={() => setFocus(`p${p.id}`)}>
                    <Photo p={p} w={330} />
                    <span className={`tag mono k-${p.kind}`}>{p.kind}</span>
                    <span className="tx"><b>{p.name}</b><span>{p.why}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : tab === "stay" ? (
            <ul className="list">
              {guide.stay.map((s, i) => (
                <li key={s.area}>
                  <button className={`card press ${focus === `s${i}` ? "on" : ""}`} onClick={() => setFocus(`s${i}`)}>
                    <span className="tx"><b>{s.area}</b><span>{s.why}</span></span>
                  </button>
                  <a className="btn press" href={bookingUrl(`${s.area}, ${dest.en}`, o, b)} target="_blank" rel="noreferrer">לינה באזור</a>
                </li>
              ))}
              <li><div className="card"><span className="tx"><b>מהשדה למרכז</b><span>{guide.airport}</span></span></div></li>
            </ul>
          ) : (
            <ul className="list">
              {guide.food.map((f) => <li key={f.dish}><div className="card"><span className="tag mono k-אוכל">מנה</span><span className="tx"><b>{f.dish}</b><span>{f.where}</span></span></div></li>)}
              {guide.tips.map((t, i) => <li key={i}><div className="card"><span className="tag mono">טיפ</span><span className="tx"><span>{t}</span></span></div></li>)}
            </ul>
          )}
        </div>
      </section>

      <div className="t-stage">
        <Map3D pins={pins.length ? pins : [{ id: "city", lat: dest.lat, lng: dest.lng, label: dest.he }]} lines={lines} focusId={focus}
          onPick={(id) => setFocus(id)} fitKey={fitKey} className="t-map" />
        {guide && tab !== "stay" && (
          <div className="film" aria-label="המקומות על המפה">
            {(tab === "days" && stops.length ? stops : guide.places).map((p, i) => (
              <button key={p.id} className={`frame press ${focus === `p${p.id}` ? "on" : ""}`} onClick={() => setFocus(`p${p.id}`)}>
                <Photo p={p} />
                <span>{tab === "days" && <em className="mono">{i + 1}</em>}{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
