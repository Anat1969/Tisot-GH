import { useEffect, useState } from "react";

export type Walk = {
  /** המסלול לאורך הרחובות, [קו רוחב, קו אורך] */
  coords: [number, number][];
  /** לכל קטע בין שתי עצירות: מטרים ודקות הליכה */
  legs: { m: number; min: number }[];
  m: number;
  min: number;
  /** true כשהשירות לא ענה והקו הוא קו ישר בין העצירות */
  straight: boolean;
};
type Pt = { lat: number; lng: number };

const OSRM = "https://routing.openstreetmap.de/routed-foot/route/v1/foot/";
const key = (pts: Pt[]) => "tisot.walk." + pts.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
const KMH = 4.5; // קצב הליכה של תייר, לא של ספורטאי

function straight(pts: Pt[]): Walk {
  const r = Math.PI / 180;
  const legs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
    const m = Math.round(Math.sqrt(x * x + y * y) * 6371e3 * 1.3);
    return { m, min: Math.round(m / ((KMH * 1000) / 60)) };
  });
  return { coords: pts.map((p) => [p.lat, p.lng]), legs, m: legs.reduce((s, l) => s + l.m, 0), min: legs.reduce((s, l) => s + l.min, 0), straight: true };
}

/** מסלול הליכה אמיתי לאורך הרחובות בין עצירות היום, משירות הניתוב של OpenStreetMap. נשמר במכשיר, כדי לא לבקש שוב. */
export function useWalk(pts: Pt[]): Walk | null {
  const k = pts.length > 1 ? key(pts) : "";
  const [walk, setWalk] = useState<Walk | null>(null);
  useEffect(() => {
    setWalk(null);
    if (!k) return;
    try {
      const hit = localStorage.getItem(k);
      if (hit) { setWalk(JSON.parse(hit)); return; }
    } catch { /* בלי אחסון במכשיר */ }
    let dead = false;
    const ctl = new AbortController();
    fetch(`${OSRM}${pts.map((p) => `${p.lng},${p.lat}`).join(";")}?overview=full&geometries=geojson`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        const r = j?.routes?.[0];
        if (!r) throw new Error("no route");
        const legs = (r.legs as { distance: number; duration: number }[]).map((l) => ({ m: Math.round(l.distance), min: Math.max(1, Math.round(l.distance / ((KMH * 1000) / 60))) }));
        const w: Walk = {
          coords: (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng]),
          legs, m: legs.reduce((s, l) => s + l.m, 0), min: legs.reduce((s, l) => s + l.min, 0), straight: false,
        };
        if (dead) return;
        setWalk(w);
        try { localStorage.setItem(k, JSON.stringify(w)); } catch { /* מלא או חסום */ }
      })
      .catch(() => { if (!dead) setWalk(straight(pts)); });
    return () => { dead = true; ctl.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return walk;
}

export const fmtM = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);
export const fmtMin = (min: number) => (min < 60 ? `${min} דק'` : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")} שע'`);
