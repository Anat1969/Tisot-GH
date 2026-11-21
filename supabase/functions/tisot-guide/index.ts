// טיסות: המדריך המקומי. מחזיר מדריך שמור ליעד, ואם אין, כותב אחד עם Gemini החינמי ושומר אותו.
// GET ?dest=KRK מחזיר רק שמור. POST {dest} יוצר אם חסר. יעד חייב להיות ברשימת tisot_dests.
import { createClient } from "jsr:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization, apikey", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json; charset=utf-8" } });
const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.0-flash"];

const SYSTEM = `אתה מדריך טיולים מקומי, שנולד וחי בעיר שעליה שואלים, ומדריך בה ישראלים כבר שנים.
כתוב בעברית טבעית, קצרה ומקצועית, בגוף ראשון. בלי אמוג'י ובלי סימני קריאה. בלי קלישאות של עלון תיירות.
כל הסבר עד 20 מילים. שורת תובנה עד 8 מילים. עדיף פרט מוחשי אחד על שלושה שמות תואר.
רק מקומות אמיתיים שקיימים היום, עם קואורדינטות מדויקות ככל האפשר. אם אינך בטוח במקום, אל תכלול אותו.
החזר JSON בלבד, במבנה הזה בדיוק:
{
 "guide_name": "שם פרטי מקומי אופייני",
 "tagline": "שורת תובנה על העיר",
 "intro": "שניים עד שלושה משפטים: מה מיוחד בעיר בעיניים של מקומי, ולמי היא מתאימה",
 "airport": "איך מגיעים משדה התעופה למרכז, כמה זמן וכמה זה עולה בערך",
 "stay": [{"area": "שם שכונה", "why": "למי היא מתאימה", "lat": 0, "lng": 0}],
 "places": [{"id": 1, "name": "שם בעברית", "local": "השם בשפת המקום או באנגלית", "kind": "חובה|תרבות|אוכל|טבע|סמוי", "why": "למה ללכת", "lat": 0, "lng": 0, "mins": 60}],
 "days": [{"title": "כותרת ליום", "stops": [{"place": 1, "when": "בוקר|צהריים|אחר הצהריים|ערב", "note": "מה עושים שם, וטיפ אחד"}]}],
 "food": [{"dish": "מנה מקומית", "where": "איפה אוכלים אותה"}],
 "tips": ["טיפ מעשי של מקומי"]
}
כללים: 3 שכונות ללינה. 14 מקומות, מהם לפחות 3 מסוג "סמוי" שתיירים מפספסים ולפחות 3 מסוג "אוכל". 5 ימים, 3 עד 4 עצירות ביום, מסודרות לפי קרבה גאוגרפית כך שהולכים ברגל.
היום הראשון קל, כי נוחתים. שלושת הימים הראשונים מכסים את החובה, כך שגם טיול של 3 ימים שלם. היום החמישי יכול להיות טיול יום מחוץ לעיר.
כל עצירה מפנה ל-id של מקום מהרשימה. 4 מנות, 5 טיפים.`;

async function gemini(prompt: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("חסר GEMINI_API_KEY");
  let last = "";
  for (const model of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.6, maxOutputTokens: 20000, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) { last = model + " " + r.status; continue; }
      const j = await r.json();
      const text = (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
      const a = text.indexOf("{"), b = text.lastIndexOf("}");
      return { model, data: JSON.parse(text.slice(a, b + 1)) };
    } catch (e) { last = model + " " + String((e as Error).message).slice(0, 80); }
  }
  throw new Error("המדריך לא זמין כרגע (" + last + ")");
}

function clean(g: any, lat: number, lng: number) {
  const near = (p: any) => typeof p?.lat === "number" && typeof p?.lng === "number" && Math.abs(p.lat - lat) < 1.5 && Math.abs(p.lng - lng) < 2.5;
  const s = (v: unknown, n = 300) => String(v ?? "").slice(0, n);
  const places = (Array.isArray(g.places) ? g.places : []).filter(near).slice(0, 16).map((p: any, i: number) => ({
    id: Number(p.id) || i + 1, name: s(p.name, 80), local: s(p.local, 80), kind: s(p.kind, 12), why: s(p.why, 200), lat: p.lat, lng: p.lng, mins: Number(p.mins) || 60 }));
  const ids = new Set(places.map((p: any) => p.id));
  const days = (Array.isArray(g.days) ? g.days : []).slice(0, 6).map((d: any) => ({
    title: s(d.title, 80),
    stops: (Array.isArray(d.stops) ? d.stops : []).filter((x: any) => ids.has(Number(x.place))).slice(0, 5).map((x: any) => ({ place: Number(x.place), when: s(x.when, 20), note: s(x.note, 220) })),
  })).filter((d: any) => d.stops.length);
  if (places.length < 6 || days.length < 3) throw new Error("המדריך חזר חלקי");
  return {
    guide_name: s(g.guide_name, 30), tagline: s(g.tagline, 100), intro: s(g.intro, 500), airport: s(g.airport, 300),
    stay: (Array.isArray(g.stay) ? g.stay : []).filter(near).slice(0, 4).map((a: any) => ({ area: s(a.area, 60), why: s(a.why, 200), lat: a.lat, lng: a.lng })),
    places, days,
    food: (Array.isArray(g.food) ? g.food : []).slice(0, 6).map((f: any) => ({ dish: s(f.dish, 80), where: s(f.where, 200) })),
    tips: (Array.isArray(g.tips) ? g.tips : []).slice(0, 6).map((t: any) => s(t, 220)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const dest = String(body.dest ?? url.searchParams.get("dest") ?? "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(dest)) return json({ error: "יעד לא תקין" }, 400);
    const { data: d } = await db.from("tisot_dests").select("*").eq("code", dest).maybeSingle();
    if (!d) return json({ error: "יעד לא מוכר" }, 404);
    const { data: saved } = await db.from("tisot_guides").select("data").eq("dest", dest).maybeSingle();
    if (saved) return json({ guide: saved.data, cached: true });
    if (req.method !== "POST") return json({ guide: null });
    // הגבלת קצב: לכל היותר 12 מדריכים חדשים בשעה
    const { count } = await db.from("tisot_guides").select("dest", { count: "exact", head: true }).gt("created_at", new Date(Date.now() - 36e5).toISOString());
    if ((count ?? 0) >= 12) return json({ error: "נכתבו הרבה מדריכים בשעה האחרונה. נסי שוב בעוד כמה דקות." }, 429);
    const out = await gemini(`העיר: ${d.he} (${d.en}), ${d.country}. שדה התעופה שלה נמצא בקו רוחב ${d.lat} וקו אורך ${d.lng}. כתוב את המדריך.`);
    const guide = clean(out.data, d.lat, d.lng);
    await db.from("tisot_guides").upsert({ dest, data: guide, model: out.model });
    return json({ guide, cached: false });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
