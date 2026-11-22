import type { Board, Leg } from "./api";

const dur = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
const Row = ({ dir, l }: { dir: string; l: Leg | null }) => l && (
  <span className="leg">
    <small className="mono">{dir}</small>
    <b>{l.airline}</b>
    <span className="mono">{l.dep} → {l.arr}</span>
    <small className="mono">{l.stops ? `${l.stops} עצירות` : "ישירה"} · {dur(l.minutes)} שעות</small>
  </span>
);

/** חברת התעופה והשעות של הטיסה הזולה בכל כיוון, אם הרדאר כבר בדק את התאריכים האלה. */
export default function Legs({ board, dest, out, back }: { board: Board; dest: string; out: string; back: string }) {
  const f = board.flights?.find((x) => x.dest === dest && x.out === out && x.back === back);
  if (!f || (!f.o && !f.b)) return null;
  return <div className="legs" title="הטיסה הזולה בכל כיוון ביום הזה, בשעת הבדיקה"><Row dir="הלוך" l={f.o} /><Row dir="חזור" l={f.b} /></div>;
}
