import { useEffect, useRef, useState } from "react";
import { ICS_URL, removeTrip, watch, type Board } from "./api";
import { daysUntil, ils, range, tripHash } from "./util";

export default function Mine({ board, focusDests, onChange }: { board: Board; focusDests: boolean; onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const destsRef = useRef<HTMLElement>(null);
  useEffect(() => { if (focusDests) destsRef.current?.scrollIntoView({ behavior: "smooth" }); }, [focusDests]);

  const by = new Map(board.dests.map((d) => [d.code, d]));
  const subscribe = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(ICS_URL.replace("https://", "webcal://"))}`;
  const toggle = async (code: string, on: boolean) => { setBusy(code); try { await watch(code, on); onChange(); } finally { setBusy(""); } };
  const active = board.dests.filter((d) => d.active).length;

  return (
    <div className="mine">
      <section>
        <h1>הטיולים שלי</h1>
        {board.trips.length === 0 ? <p className="empty">עוד לא נשמר טיול. בכל הזדמנות יש כפתור "לשמור טיול".</p> : (
          <div className="rows">
            {board.trips.map((t) => {
              const d = by.get(t.dest);
              return (
                <div key={t.id} className="row saved">
                  <a className="r-city" href={tripHash(t.dest, t.out_day, t.back_day)}>{d?.he ?? t.dest}<small>בעוד {daysUntil(t.out_day)} ימים</small></a>
                  <span className="r-date mono">{range(t.out_day, t.back_day)}</span>
                  <span className="r-price mono">{t.price ? `${ils(t.price)} ₪` : ""}</span>
                  <button className="chip press" onClick={() => removeTrip(t.id).then(onChange)}>להסיר</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="cal">
        <h2>ההזדמנויות נכנסות ליומן לבד</h2>
        <p>מחברים פעם אחת, ומאז כל <mark>הזדמנות חדשה וכל טיול שנשמר</mark> מופיעים ביומן Google כאירוע של יום שלם.</p>
        <div className="actions">
          <a className="btn primary press" href={subscribe} target="_blank" rel="noreferrer">לחבר ליומן Google</a>
          <button className="btn press" onClick={() => navigator.clipboard.writeText(ICS_URL).then(() => setCopied(true))}>{copied ? "הקישור הועתק" : "להעתיק קישור ליומן אחר"}</button>
        </div>
        <p className="note mono">Google מרענן יומן חיצוני בערך פעם ב-12 שעות. לאירוע מיידי יש כפתור "ליומן" בכל טיול.</p>
      </section>

      <section ref={destsRef}>
        <h2>היעדים שהרדאר סורק <span className="mono">{active} מתוך {board.dests.length}</span></h2>
        <p className="note mono">יותר יעדים = סבב סריקה ארוך יותר. עד 40 יעדים.</p>
        <div className="dest-chips">
          {board.dests.map((d) => (
            <button key={d.code} className="chip press" aria-pressed={d.active} disabled={busy === d.code} onClick={() => toggle(d.code, !d.active)}>
              {d.he}{d.lo ? <small className="mono"> {ils(d.lo)}</small> : null}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
