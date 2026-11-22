import type { Board, Deal } from "./api";
import { MONTHS, ils, tripHash } from "./util";
import { thumb } from "./images";

/** גרסת השנה: יעדים מול חודשים. כל תא הוא המחיר הזול באותו חודש, והצבע אומר כמה הוא מתחת לרגיל של היעד. */
export default function Year({ board }: { board: Board }) {
  const dests = board.dests.filter((d) => d.med && d.deals.length).sort((a, b) => (a.lo ?? 0) - (b.lo ?? 0));
  const yms = [...new Set(dests.flatMap((d) => d.deals.map((x) => x.out.slice(0, 7))))].sort();
  const cell = (deals: Deal[], ym: string) => deals.filter((x) => x.out.startsWith(ym)).sort((a, b) => a.p - b.p)[0];
  const tone = (off: number) => (off >= 0.4 ? "t4" : off >= 0.25 ? "t3" : off >= 0.1 ? "t2" : off >= 0 ? "t1" : "t0");

  let best: { he: string; ym: string; off: number } | null = null;
  for (const d of dests) for (const ym of yms) {
    const c = cell(d.deals, ym);
    if (c && (!best || 1 - c.p / d.med! > best.off)) best = { he: d.he, ym, off: 1 - c.p / d.med! };
  }

  return (
    <div className="year">
      <div className="year-head">
        <h1>מתי לאן</h1>
        {best && <p className="insight">הפער הגדול בשנה: <mark>{best.he} ב{MONTHS[+best.ym.slice(5) - 1]}</mark>, {Math.round(best.off * 100)}% מתחת לרגיל.</p>}
        <p className="legend mono">
          <span className="sw t4" />40% ומעלה מתחת לרגיל<span className="sw t3" />25%<span className="sw t2" />10%<span className="sw t1" />רגיל<span className="sw t0" />יקר
        </p>
      </div>
      <div className="grid-wrap">
        <table className="heat">
          <thead>
            <tr><th>יעד</th>{yms.map((ym) => <th key={ym} className="mono">{MONTHS[+ym.slice(5) - 1]}<small>{ym.slice(2, 4)}</small></th>)}</tr>
          </thead>
          <tbody>
            {dests.map((d) => (
              <tr key={d.code}>
                <th><a className="y-dest" href={tripHash(d.code, d.deals[0].out, d.deals[0].back)}>{d.img && <img src={thumb(d.img, 120)} alt="" loading="lazy" />}{d.he}</a></th>
                {yms.map((ym) => {
                  const c = cell(d.deals, ym);
                  return c
                    ? <td key={ym}><a className={`mono cellb press ${tone(1 - c.p / d.med!)}`} href={tripHash(d.code, c.out, c.back)} title={`${c.n} לילות`}>{ils(c.p)}</a></td>
                    : <td key={ym} className="nil mono">·</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
