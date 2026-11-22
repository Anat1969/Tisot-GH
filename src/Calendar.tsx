import { useEffect, useMemo, useRef, useState } from "react";
import { loadCal } from "./api";
import { MONTHS, addDays, ils } from "./util";

type Props = { dest: string; out: string; nights: number; onPick: (out: string, back: string, price: number) => void };
const FULL = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const DOW = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

/** לוח השנה של היעד: כל יום יציאה צבוע לפי המקום של המחיר שלו בין כל המחירים. חמשת הזולים ממוספרים. */
export default function Calendar({ dest, out, nights, onPick }: Props) {
  const [rows, setRows] = useState<[string, number, number][] | null>(null);
  const [n, setN] = useState(nights);
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { setN(nights); }, [nights]);
  useEffect(() => { let dead = false; setRows(null); loadCal(dest).then((r) => !dead && setRows(r)); return () => { dead = true; }; }, [dest]);

  const { byDay, months, top, cuts, options } = useMemo(() => {
    const options = [...new Set((rows ?? []).map((r) => r[1]))].sort();
    const mine = (rows ?? []).filter((r) => r[1] === n);
    const byDay = new Map(mine.map((r) => [r[0], r[2]]));
    const sorted = mine.map((r) => r[2]).sort((a, b) => a - b);
    const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))] ?? 0;
    const months = [...new Set(mine.map((r) => r[0].slice(0, 7)))].sort();
    const top = new Map([...mine].sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0])).slice(0, 5).map((r, i) => [r[0], i + 1]));
    return { byDay, months, top, cuts: [q(0.08), q(0.25), q(0.5), q(0.75)], options };
  }, [rows, n]);

  useEffect(() => { strip.current?.querySelector(".cal-day.sel")?.scrollIntoView({ inline: "center", block: "nearest" }); }, [months.length, out]);

  if (!rows) return <p className="empty">טוען את לוח המחירים...</p>;
  if (!byDay.size) return <p className="empty">עוד אין מחירים ל-{n} לילות. הרדאר יגיע אליהם בסבב הקרוב.</p>;
  const tone = (p: number) => (p <= cuts[0] ? "t4" : p <= cuts[1] ? "t3" : p <= cuts[2] ? "t2" : p <= cuts[3] ? "t1" : "t0");
  const stay = new Set(Array.from({ length: n + 1 }, (_, i) => addDays(out, i)));
  const lo = Math.min(...byDay.values());
  const cheapMonths = months.filter((ym) => [...byDay].some(([d, p]) => d.startsWith(ym) && p <= cuts[0])).map((ym) => MONTHS[+ym.slice(5) - 1]);

  return (
    <div className="cal">
      <div className="cal-head">
        <p className="insight">הזולים ביותר ב<mark>{cheapMonths.join(", ")}</mark>, מ-{ils(lo)} ₪. {byDay.size} ימי יציאה נסרקו.</p>
        <div className="filters">
          <span className="lbl mono">לילות</span>
          {options.map((x) => <button key={x} className="chip press" aria-pressed={x === n} onClick={() => setN(x)}>{x}</button>)}
        </div>
      </div>
      <div className="cal-strip" ref={strip}>
        {months.map((ym) => {
          const y = +ym.slice(0, 4), m = +ym.slice(5) - 1;
          const first = new Date(y, m, 1).getDay(), len = new Date(y, m + 1, 0).getDate();
          return (
            <div className="cal-month" key={ym}>
              <h3>{FULL[m]} <span className="mono">{y}</span></h3>
              <div className="cal-grid">
                {DOW.map((d) => <span key={d} className="cal-dow mono">{d}</span>)}
                {Array.from({ length: first }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: len }, (_, i) => {
                  const day = `${ym}-${String(i + 1).padStart(2, "0")}`, p = byDay.get(day);
                  const cls = `cal-day mono ${p ? tone(p) : "nil"} ${day === out ? "sel" : ""} ${stay.has(day) ? "stay" : ""}`;
                  return p
                    ? <button key={day} className={cls} onClick={() => onPick(day, addDays(day, n), p)} title={`${ils(p)} ₪`}>
                        <b>{i + 1}</b><small>{ils(p)}</small>{top.has(day) && <em>{top.get(day)}</em>}
                      </button>
                    : <span key={day} className={cls}><b>{i + 1}</b></span>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="legend mono">
        <span className="sw t4" />8% הזולים<span className="sw t3" />רבע זול<span className="sw t2" />מתחת לחציון<span className="sw t1" />מעל החציון<span className="sw t0" />יקר
        <span className="sw ring" />הטיול שנבחר<em className="rank">1</em>חמשת הזולים
      </p>
    </div>
  );
}
