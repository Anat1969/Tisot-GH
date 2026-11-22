import { useState } from "react";
import type { Board, Dest } from "./api";
import { thumb } from "./images";
import Legs from "./Legs";
import { MONTHS, bookingUrl, daysUntil, gcalUrl, ils, opportunities, range, tripHash, type Filter } from "./util";

export function Filters({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  const toggle = (n: number) => {
    const has = filter.nights.includes(n);
    const next = has ? filter.nights.filter((x) => x !== n) : [...filter.nights, n];
    if (next.length) setFilter({ ...filter, nights: next });
  };
  return (
    <div className="filters">
      <span className="lbl mono">לילות</span>
      {[3, 4, 5].map((n) => <button key={n} className="chip press" aria-pressed={filter.nights.includes(n)} onClick={() => toggle(n)}>{n}</button>)}
      <span className="lbl mono">מתי</span>
      {([["all", "כל השנה"], ["soon", "60 הימים הקרובים"], ["weekend", "כולל סופ\"ש"]] as const).map(([k, t]) => (
        <button key={k} className="chip press" aria-pressed={filter.when === k} onClick={() => setFilter({ ...filter, when: k })}>{t}</button>
      ))}
    </div>
  );
}

/** המחיר הזול בכל חודש ליעד. התובנה מחושבת מהנתונים, לא כתובה ביד. */
export function MonthBars({ dest, pick }: { dest: Dest; pick?: (out: string, back: string) => void }) {
  const by = new Map<string, { p: number; out: string; back: string }>();
  for (const d of dest.deals) {
    const ym = d.out.slice(0, 7);
    if (!by.has(ym) || by.get(ym)!.p > d.p) by.set(ym, { p: d.p, out: d.out, back: d.back });
  }
  const rows = [...by.entries()].sort();
  if (rows.length < 2) return null;
  const hi = Math.max(...rows.map(([, v]) => v.p));
  const lo = Math.min(...rows.map(([, v]) => v.p));
  const cheap = rows.filter(([, v]) => v.p <= lo * 1.08).map(([ym]) => MONTHS[+ym.slice(5) - 1]);
  return (
    <div className="months">
      <div className="bars">
        {rows.map(([ym, v]) => (
          <button key={ym} className={`bar-col ${v.p <= lo * 1.08 ? "cheap" : ""}`} onClick={() => pick?.(v.out, v.back)} title={`${ils(v.p)} ₪`}>
            <span className="mono val">{ils(v.p)}</span>
            <i style={{ height: `${Math.max(8, (v.p / hi) * 100)}%` }} />
            <span className="mono mon">{MONTHS[+ym.slice(5) - 1]}</span>
          </button>
        ))}
      </div>
      <p className="insight"><mark>{cheap.join(", ")}</mark> הם החודשים הזולים. היקר ביותר עולה פי {(hi / lo).toFixed(1)}.</p>
    </div>
  );
}

export default function Home({ board, filter, setFilter }: { board: Board; filter: Filter; setFilter: (f: Filter) => void }) {
  const opps = opportunities(board, filter);
  // לחיצה על שורה בלוח מציגה את היעד על הקיר, עם התמונה בגדול. "לפתוח את הטיול" ממשיך לדף שלו.
  const [sel, setSel] = useState<string | null>(null);
  const top = opps.find((o) => o.dest.code === sel) ?? opps[0];
  const pick = (code: string) => {
    setSel(code);
    if (matchMedia("(max-width: 900px)").matches) document.querySelector(".hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const pending = board.dests.filter((d) => d.active && !d.n).length;

  return (
    <div className="home">
      <section className="hero" style={top?.dest.img ? { backgroundImage: `url('${thumb(top.dest.img, 1920)}')` } : undefined}>
        <div className="scrim" />
        <Filters filter={filter} setFilter={setFilter} />
        {!top ? (
          <p className="empty">אין כרגע הזדמנות שמתאימה לבחירה. הרדאר ממשיך לסרוק, אפשר להרחיב את הבחירה.</p>
        ) : (
          <>
            <p className="kicker mono" key={`k-${top.dest.code}`}>{top === opps[0] ? "ההזדמנות של עכשיו" : `מקום ${opps.indexOf(top) + 1} בלוח`}{top.soon ? <b className="soon"> · בעוד {daysUntil(top.deal.out)} ימים</b> : ` · בעוד ${daysUntil(top.deal.out)} ימים`}</p>
            <h1 className="city" key={`c-${top.dest.code}`}>{top.dest.he}</h1>
            <p className="where">{top.dest.country} · {range(top.deal.out, top.deal.back)} · {top.deal.n} לילות</p>
            <div className="price-row">
              <span className="price mono">{ils(top.deal.p)}<small> ₪</small></span>
              <span className="vs">
                <b className="off">{Math.round(top.off * 100)}% מתחת לרגיל</b>
                <span className="mono">בדרך כלל {ils(top.dest.med)} ₪ הלוך-חזור</span>
              </span>
            </div>
            <Legs board={board} dest={top.dest.code} out={top.deal.out} back={top.deal.back} />
            <div className="actions">
              <a className="btn primary press" href={tripHash(top.dest.code, top.deal.out, top.deal.back)}>לפתוח את הטיול</a>
              <a className="btn press" href={gcalUrl(top.dest, top.deal.out, top.deal.back, top.deal.p)} target="_blank" rel="noreferrer">ליומן</a>
              <a className="btn press" href={bookingUrl(top.dest.en, top.deal.out, top.deal.back)} target="_blank" rel="noreferrer">לינה ב-Booking</a>
            </div>
            <MonthBars dest={top.dest} pick={(o, b) => (location.hash = tripHash(top.dest.code, o, b))} />
          </>
        )}
      </section>

      <aside className="board">
        <h2 className="mono">לוח ההמראות <span>{opps.length} יעדים</span></h2>
        <div className="rows">
          {opps.map((o, i) => (
            <button key={o.dest.code} className={`row press ${o === top ? "first" : ""}`} aria-pressed={o === top} onClick={() => pick(o.dest.code)} title={`${i + 1}. ${o.dest.he}`}>
              {o.dest.img ? <img className="r-img" src={thumb(o.dest.img, 120)} alt="" loading="lazy" /> : <span className="r-img" />}
              <span className="r-city">{o.dest.he}<small>{o.dest.country}</small></span>
              <span className="r-date mono">{range(o.deal.out, o.deal.back)}</span>
              <span className="r-price mono">{ils(o.deal.p)} ₪</span>
              <span className={`r-off mono ${o.off >= 0.25 ? "good" : ""}`}>{o.off > 0 ? `${Math.round(o.off * 100)}%-` : "רגיל"}</span>
            </button>
          ))}
        </div>
        {pending > 0 && <p className="note mono">עוד {pending} יעדים בסריקה ראשונה. הלוח מתמלא לבד.</p>}
      </aside>
    </div>
  );
}
