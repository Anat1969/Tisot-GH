#!/usr/bin/env python3
"""טיסות: הסורק. לוקח מהתור את החלקים שלא נסרקו הכי הרבה זמן, שואל את לוח המחירים הציבורי
של Google Flights, ושולח את התוצאה לענן (tisot_ingest). בלי התקנות ובלי מפתח סודי.

אם גוגל מבקש הפסקה: מחכים דקה פעם אחת, ואם זה חוזר, עוצרים. לא מנסים לעקוף.
  python3 scripts/scan.py --max 40 --seconds 240
"""
import argparse, json, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, timedelta

API = "https://ktqmwpbzcnzkhjskqisy.supabase.co/rest/v1"
KEY = "sb_publishable_IkreG7naPa1h-d4kGp1gpA_sLU4tg5q"  # מפתח ציבורי. הכתיבה נבדקת בפונקציה במסד
BASE = "https://www.google.com/_/FlightsFrontendUi/data/travel.frontend.flights.FlightsFrontendService/"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
ORIGIN = "TLV"


class Blocked(Exception):
    pass


def db(path, body=None):
    req = urllib.request.Request(f"{API}/{path}", data=json.dumps(body).encode() if body is not None else None,
                                 headers={"apikey": KEY, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode() or "null")


def seg(o, d, day):
    return [[[[o, 0]]], [[[d, 0]]], None, 0, None, None, day, None, None, None, None, None, None, None, 3]


def calendar(dest, start, end, nights):
    filters = [None, None, 1, None, [], 1, [1, 0, 0, 0], None, None, None, None, None, None,
               [seg(ORIGIN, dest, start.isoformat()), seg(dest, ORIGIN, (start + timedelta(days=nights)).isoformat())],
               None, None, None, 1]
    inner = [None, filters, [start.isoformat(), end.isoformat()], None, [nights, nights]]
    body = "f.req=" + urllib.parse.quote(json.dumps([None, json.dumps(inner, separators=(",", ":"))], separators=(",", ":")))
    req = urllib.request.Request(f"{BASE}GetCalendarGraph?curr=ILS&hl=en", data=body.encode(), headers={
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode("utf-8").lstrip()
    except urllib.error.HTTPError as e:
        if e.code in (429, 302):
            raise Blocked(f"status {e.code}") from e
        raise
    if raw.startswith(")]}'"):
        raw = raw[4:]
    data = None
    for line in raw.splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        try:
            outer = json.loads(line)
        except ValueError:
            continue
        for item in outer:
            if isinstance(item, list) and item and item[0] == "wrb.fr":
                if item[2] is None:
                    code = item[5] if len(item) > 5 else None
                    if code and code[0] in (13, 7, 8):
                        raise Blocked(f"code {code[0]}")
                    return []
                data = json.loads(item[2])
        if data:
            break
    out = []
    if not data or not isinstance(data[-1], list):
        return out
    for it in data[-1]:
        try:
            out.append([it[0], it[1], float(it[2][0][1])])
        except (IndexError, TypeError, ValueError):
            continue
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=40, help="כמה חלקים לכל היותר בהרצה")
    ap.add_argument("--seconds", type=int, default=240, help="תקציב זמן להרצה")
    ap.add_argument("--pause", type=float, default=4.0, help="שניות בין בקשות")
    a = ap.parse_args()
    t0, today, waited, done = time.time(), date.today(), False, 0
    chunks = db(f"tisot_chunks?select=dest,nights,idx&order=scanned_at.asc.nullsfirst,idx,nights,dest&limit={a.max}")
    for c in chunks:
        if time.time() - t0 > a.seconds:
            break
        start = today + timedelta(days=1 + c["idx"] * 61)
        last = today + timedelta(days=329 - c["nights"])
        end = min(start + timedelta(days=60), last)
        if start > last:
            continue
        state, rows = "ok", []
        try:
            rows = calendar(c["dest"], start, end, c["nights"])
        except Blocked as e:
            if c["idx"] >= 4:
                state = "end"  # סוף הטווח שגוגל מוכר, לא חסימה
            elif not waited:
                waited = True
                print(f"גוגל מבקש להאט ({e}). מחכה דקה.", flush=True)
                time.sleep(60)
                continue
            else:
                print(f"גוגל ביקש הפסקה ({e}). עוצר אחרי {done} חלקים.", flush=True)
                break
        n = db("rpc/tisot_ingest", {"p_dest": c["dest"], "p_nights": c["nights"], "p_idx": c["idx"],
                                    "p_start": start.isoformat(), "p_end": end.isoformat(), "p_rows": rows, "p_state": state})
        done += 1
        print(f"{c['dest']} {c['nights']} לילות, חלק {c['idx']}: {n} מחירים ({state})", flush=True)
        time.sleep(a.pause)
    print(f"נסרקו {done} חלקים ב-{int(time.time() - t0)} שניות")


if __name__ == "__main__":
    sys.exit(main())
