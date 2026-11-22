import { useMemo, useState } from "react";
import type { Board } from "./api";
import Map3D, { type Pin } from "./Map3D";
import { Filters } from "./Home";
import { thumb } from "./images";
import Legs from "./Legs";
import { bookingUrl, daysUntil, gcalUrl, ils, opportunities, range, tripHash, type Filter } from "./util";

const TLV: [number, number] = [32.01, 34.89];

/** גרסת הגלובוס: כל יעד הוא תמונה ומחיר. לחיצה מטיסה את הגלובוס אל היעד ופותחת את ההצעה. */
export default function World({ board, filter, setFilter }: { board: Board; filter: Filter; setFilter: (f: Filter) => void }) {
  const opps = useMemo(() => opportunities(board, filter), [board, filter]);
  const [sel, setSel] = useState<string | null>(null);
  const pins: Pin[] = useMemo(() => [
    { id: "TLV", lat: TLV[0], lng: TLV[1], label: "תל אביב", cls: "origin" },
    ...opps.map((o) => ({
      id: o.dest.code, lat: o.dest.lat, lng: o.dest.lng, cls: o.off >= 0.25 ? "deal" : "plain",
      img: thumb(o.dest.img, 120), label: `${o.dest.he} <b>${ils(o.deal.p)}</b>`,
    })),
  ], [opps]);
  const lines = useMemo(() => opps.filter((o) => o.off >= 0.25 || o.dest.code === sel).map((o) => [TLV, [o.dest.lat, o.dest.lng]] as [number, number][]), [opps, sel]);
  const good = opps.filter((o) => o.off >= 0.25).length;
  const cur = opps.find((o) => o.dest.code === sel) ?? null;

  return (
    <div className="world">
      <Map3D world pins={pins} lines={lines} focusId={sel} onPick={(id) => setSel(id === "TLV" ? null : id)} fitKey={String(opps.length)} className="world-map" />
      <div className="world-head glass">
        <h1>לאן זול עכשיו</h1>
        <p className="insight"><mark>{good} יעדים</mark> במחיר של הזדמנות, מתוך {opps.length} שנסרקו.</p>
        <Filters filter={filter} setFilter={setFilter} />
        <p className="legend mono"><span className="sw t4" />הזדמנות: 25% ומעלה מתחת לרגיל<span className="sw t1" />מחיר רגיל</p>
      </div>
      {cur && (
        <article className="offer glass">
          {cur.dest.img && <img src={thumb(cur.dest.img, 500)} alt={cur.dest.he} />}
          <div className="offer-tx">
            <p className="kicker mono">{cur.dest.country} · בעוד {daysUntil(cur.deal.out)} ימים</p>
            <h2>{cur.dest.he}</h2>
            <p className="where">{range(cur.deal.out, cur.deal.back)} · {cur.deal.n} לילות</p>
            <p className="price-row"><span className="price mono">{ils(cur.deal.p)}<small> ₪</small></span>
              <span className="vs"><b className={cur.off >= 0.1 ? "off" : ""}>{cur.off > 0 ? `${Math.round(cur.off * 100)}% מתחת לרגיל` : "מחיר רגיל"}</b><span className="mono">בדרך כלל {ils(cur.dest.med)} ₪</span></span></p>
            <Legs board={board} dest={cur.dest.code} out={cur.deal.out} back={cur.deal.back} />
            <div className="actions">
              <a className="btn primary press" href={tripHash(cur.dest.code, cur.deal.out, cur.deal.back)}>לפתוח את הטיול</a>
              <a className="btn press" href={gcalUrl(cur.dest, cur.deal.out, cur.deal.back, cur.deal.p)} target="_blank" rel="noreferrer">ליומן</a>
              <a className="btn press" href={bookingUrl(cur.dest.en, cur.deal.out, cur.deal.back)} target="_blank" rel="noreferrer">Booking</a>
            </div>
          </div>
          <button className="x press" aria-label="לסגור" onClick={() => setSel(null)}>×</button>
        </article>
      )}
    </div>
  );
}
