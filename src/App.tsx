import { useCallback, useEffect, useState } from "react";
import "./ai-menu";
import { cachedBoard, loadBoard, type Board } from "./api";
import { ago, type Filter } from "./util";
import Home from "./Home";
import World from "./World";
import Year from "./Year";
import TripPage from "./Trip";
import Mine from "./Mine";

const NAV: [string, string][] = [["#/", "הזדמנות"], ["#/map", "מפה"], ["#/year", "שנה"], ["#/mine", "הטיולים שלי"]];
const useHash = () => {
  const [h, set] = useState(location.hash || "#/");
  useEffect(() => {
    const on = () => set(location.hash || "#/");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return h;
};

export default function App() {
  const hash = useHash();
  const [board, setBoard] = useState<Board | null>(cachedBoard);
  const [err, setErr] = useState("");
  const [about, setAbout] = useState(false);
  const [filter, setFilter] = useState<Filter>({ nights: [3, 4, 5], when: "all" });

  const refresh = useCallback(() => loadBoard().then((b) => { setBoard(b); setErr(""); }).catch((e) => setErr(String(e.message ?? e))), []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5 * 60e3);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    const on = (e: Event) => {
      const id = (e as CustomEvent).detail;
      if (id === "refresh") refresh();
      if (id === "calendar") location.hash = "#/mine";
      if (id === "dests") location.hash = "#/mine/dests";
      if (id === "about") setAbout(true);
    };
    addEventListener("ai-action", on);
    return () => removeEventListener("ai-action", on);
  }, [refresh]);

  const parts = hash.slice(2).split("/");
  const page = parts[0] || "home";
  const scanned = board?.dests.filter((d) => d.n).length ?? 0;

  return (
    <div className="app">
      <header className="bar">
        <a className="brand" href="#/">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden="true"><path d="M21 3 3 10.5l6.5 2.5L12 20z" /><path d="M21 3 9.5 13" /></svg>
          <span>טיסות</span>
        </a>
        <nav className="nav">
          {NAV.map(([h, t]) => (
            <a key={h} href={h} className="chip press" aria-current={(h === "#/" ? page === "home" : hash.startsWith(h)) ? "page" : undefined}>{t}</a>
          ))}
        </nav>
        <span className="radar mono" title={board?.state?.last_note ?? ""}>
          <i className={board?.state?.blocked_until ? "dot wait" : "dot"} />
          הרדאר סרק {ago(board?.state?.last_run)} · {scanned} יעדים
        </span>
        <ai-menu />
      </header>

      <main className="main">
        {!board ? <p className="empty">{err ? `לא הצלחתי לטעון את הלוח: ${err}` : "טוען את הלוח..."}</p>
          : page === "t" && parts[1] ? <TripPage board={board} code={parts[1]} out={parts[2]} back={parts[3]} onSaved={refresh} />
          : page === "map" ? <World board={board} filter={filter} setFilter={setFilter} />
          : page === "year" ? <Year board={board} />
          : page === "mine" ? <Mine board={board} focusDests={parts[1] === "dests"} onChange={refresh} />
          : <Home board={board} filter={filter} setFilter={setFilter} />}
      </main>

      {about && (
        <div className="veil" onClick={() => setAbout(false)}>
          <div className="sheet" role="dialog" aria-label="איך זה עובד" onClick={(e) => e.stopPropagation()}>
            <h2>ההזדמנות מוצאת אותך</h2>
            <ol>
              <li><b>רדאר.</b> כל שעה נסרק חלק מלוח המחירים הציבורי של Google Flights, מתל אביב ל-{board?.dests.filter((d) => d.active).length} יעדים.</li>
              <li><b>הזדמנות.</b> מחיר שנמוך בהרבה מהמחיר הרגיל של אותו יעד. יציאה ב-60 הימים הקרובים מקבלת עדיפות.</li>
              <li><b>טיול.</b> לכל הזדמנות: מדריך מקומי, מפה ולוויין, מסלול לפי ימים, לינה ב-Booking ויומן.</li>
            </ol>
            <p className="note">המחירים הם למבוגר אחד, הלוך-חזור, בלי כבודה, בשעת הסריקה. לפני הזמנה בודקים את המחיר הסופי.</p>
            <button className="btn press" onClick={() => setAbout(false)}>הבנתי</button>
          </div>
        </div>
      )}
    </div>
  );
}
