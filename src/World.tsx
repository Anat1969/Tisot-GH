import { useMemo } from "react";
import type { Board } from "./api";
import LMap, { type Pin } from "./LMap";
import { Filters } from "./Home";
import { ils, opportunities, tripHash, type Filter } from "./util";

const TLV: [number, number] = [32.01, 34.89];

/** גרסת המפה: כל יעד הוא תווית מחיר. ירוק = הזדמנות (25% ומעלה מתחת לרגיל). */
export default function World({ board, filter, setFilter }: { board: Board; filter: Filter; setFilter: (f: Filter) => void }) {
  const opps = useMemo(() => opportunities(board, filter), [board, filter]);
  const pins: Pin[] = useMemo(() => [
    { lat: TLV[0], lng: TLV[1], label: "תל אביב", cls: "origin" },
    ...opps.map((o) => ({
      lat: o.dest.lat, lng: o.dest.lng, cls: o.off >= 0.25 ? "deal" : "",
      label: `${o.dest.he} <b>${ils(o.deal.p)}</b>`, title: o.dest.he,
      onClick: () => (location.hash = tripHash(o.dest.code, o.deal.out, o.deal.back)),
    })),
  ], [opps]);
  const lines = useMemo(() => opps.filter((o) => o.off >= 0.25).map((o) => [TLV, [o.dest.lat, o.dest.lng]] as [number, number][]), [opps]);
  const good = opps.filter((o) => o.off >= 0.25).length;

  return (
    <div className="world">
      <div className="world-head">
        <h1>לאן זול עכשיו</h1>
        <p className="insight"><mark>{good} יעדים</mark> במחיר של הזדמנות, מתוך {opps.length} שנסרקו.</p>
        <Filters filter={filter} setFilter={setFilter} />
        <p className="legend mono"><span className="pin deal">הזדמנות</span><span className="pin">מחיר רגיל</span> לחיצה על יעד פותחת את הטיול</p>
      </div>
      <LMap pins={pins} lines={lines} dashed fitKey={String(opps.length)} className="world-map" />
    </div>
  );
}
