import { useEffect, useState } from "react";
import { savePlaceImgs, type Guide } from "./api";

const STEPS = [250, 330, 500, 960, 1280, 1920];
/** ויקימדיה מגישה תמונות רק ברוחבים קבועים. בוחרים את הקטן ביותר שמספיק. */
export function thumb(url: string | null | undefined, w: number) {
  if (!url) return "";
  const step = STEPS.find((s) => s >= w) ?? 1920;
  if (/\/\d+px-/.test(url)) return url.replace(/\/\d+px-/, `/${step}px-`);
  // תמונה שנשמרה בגודל המקורי (עד 1600 פיקסלים): לתצוגה קטנה בונים ממנה כתובת מוקטנת
  const m = url.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/\w+)\/(\w\/\w\w)\/([^/]+)$/);
  return m && step <= 500 ? `${m[1]}/thumb/${m[2]}/${m[3]}/500px-${m[3]}` : url;
}

/** תמונה לכל מקום במדריך: בקשה אחת לוויקיפדיה לפי השם המקומי, ושמירה בענן כך שזה קורה פעם אחת לכל יעד. */
export function usePlaceImages(dest: string, city: string, guide: Guide | null) {
  const [imgs, setImgs] = useState<Record<number, string>>({});
  useEffect(() => {
    setImgs({});
    if (!guide) return;
    const known: Record<number, string> = {};
    guide.places.forEach((p) => { if (p.img) known[p.id] = p.img; });
    setImgs(known);
    const missing = guide.places.filter((p) => p.img === undefined && p.local);
    if (!missing.length) return;
    let dead = false;
    (async () => {
      const titles = missing.map((p) => p.local.replace(/\s*\(.*?\)\s*/g, " ").trim());
      const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&pilimit=50&titles=" + encodeURIComponent(titles.join("|"));
      const q = (await (await fetch(u)).json()).query ?? {};
      let back: Record<string, string> = Object.fromEntries(titles.map((t) => [t, t]));
      for (const step of ["normalized", "redirects"]) {
        const m: Record<string, string> = Object.fromEntries((q[step] ?? []).map((x: { from: string; to: string }) => [x.from, x.to]));
        back = Object.fromEntries(Object.entries(back).map(([k, v]) => [k, m[v] ?? v]));
      }
      const by: Record<string, string> = {};
      for (const pg of Object.values(q.pages ?? {}) as { title: string; thumbnail?: { source: string } }[]) {
        const src = pg.thumbnail?.source.split("?")[0] ?? "";
        if (src && !/\.svg|logo|map|flag|coat/i.test(src)) by[pg.title] = src;
      }
      const found: Record<string, string> = {};
      missing.forEach((p, i) => { found[p.id] = by[back[titles[i]]] ?? ""; });
      // מה שלא נמצא לפי שם מדויק: חיפוש בוויקיפדיה לפי שם המקום והעיר, אחד אחד
      for (let i = 0; i < missing.length; i++) {
        const p = missing[i];
        if (found[p.id]) continue;
        const su = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=500&gsrsearch=" + encodeURIComponent(`${titles[i].split("/")[0]} ${city}`);
        try {
          const res = await fetch(su);
          // חיפוש שנכשל (למשל הגבלת קצב) לא נשמר כ"אין תמונה", כדי שינסו שוב בביקור הבא
          if (!res.ok) { delete found[p.id]; continue; }
          const pg = Object.values(((await res.json()).query?.pages ?? {}) as Record<string, { thumbnail?: { source: string } }>)[0];
          const src = pg?.thumbnail?.source.split("?")[0] ?? "";
          if (src && !/\.svg|logo|map|flag|coat/i.test(src)) found[p.id] = src;
        } catch { delete found[p.id]; }
      }
      if (!dead) setImgs((old) => ({ ...old, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) }));
      savePlaceImgs(dest, found).catch(() => { /* יישמר בפעם הבאה */ });
    })().catch(() => { /* בלי תמונות: המקום מוצג באריח טיפוגרפי */ });
    return () => { dead = true; };
  }, [dest, city, guide]);
  return imgs;
}
