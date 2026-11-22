#!/usr/bin/env python3
"""טיסות: תמונה לכל יעד. לוקח את תמונת הדף מוויקי-מסע, ואם היא מפה או קולאז', מוויקיפדיה. רץ פעם אחת לכל יעד חדש."""
import json, re, time, urllib.parse, urllib.request

API = "https://ktqmwpbzcnzkhjskqisy.supabase.co/rest/v1"
KEY = "sb_publishable_IkreG7naPa1h-d4kGp1gpA_sLU4tg5q"
BAD = re.compile(r"(?i)flag|coat|map|logo|locator|\.svg|districts|regions|_wv|montage|collage|banner")


def get(u, body=None):
    for attempt in range(4):
        try:
            r = urllib.request.Request(u, data=json.dumps(body).encode() if body is not None else None,
                                       headers={"apikey": KEY, "content-type": "application/json", "user-agent": "tisot-app/1.0 (personal trip planner)"})
            return json.loads(urllib.request.urlopen(r, timeout=30).read().decode() or "null")
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 3:
                raise
            time.sleep(8 * (attempt + 1))


def batch(site, titles):
    """בקשה אחת לכל הכותרות: ויקימדיה מגבילה קצב, ולכן לא שולחים בקשה לכל יעד."""
    u = (f"https://{site}/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=thumbnail"
         "&pithumbsize=1600&pilimit=50&titles=" + urllib.parse.quote("|".join(titles)))
    q = get(u)["query"]
    back = {t: t for t in titles}
    for step in ("normalized", "redirects"):
        m = {x["from"]: x["to"] for x in q.get(step, [])}
        back = {k: m.get(v, v) for k, v in back.items()}
    by = {p["title"]: p.get("thumbnail", {}).get("source", "").split("?")[0] for p in q["pages"].values()}
    return {k: by.get(v, "") for k, v in back.items()}


def main():
    todo = [d for d in get(API + "/tisot_dests?select=code,en,img") if not d["img"]]
    if not todo:
        return print("לכל היעדים יש תמונה")
    names = sorted({d["en"] for d in todo})
    voyage = batch("en.wikivoyage.org", names)
    time.sleep(3)
    pedia = batch("en.wikipedia.org", names)
    saved = 0
    for d in todo:
        v, w = voyage.get(d["en"], ""), pedia.get(d["en"], "")
        t = next((x for x in (v, w) if x and not BAD.search(x)), "") or v or w
        ok = bool(t) and get(API + "/rpc/tisot_dest_img", {"p_code": d["code"], "p_url": t})
        print(d["code"], "נשמר" if ok else "אין תמונה", (t or "")[-60:], flush=True)
        saved += bool(ok)
    print("נשמרו", saved)


if __name__ == "__main__":
    main()
