// בדיקת עשן: כל המסכים נטענים עם נתונים אמיתיים, בלי גלילה אופקית ובלי שגיאות. מצלמת מסך במחשב ובנייד.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const BASE = process.env.BASE_URL || "http://localhost:4173";
const fail = [];
const check = (ok, msg) => { console.log((ok ? "עבר  " : "נכשל ") + msg); if (!ok) fail.push(msg); };

(async () => {
  let server;
  if (!process.env.BASE_URL) {
    server = spawn("npx", ["vite", "preview", "--port", "4173"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 2500));
  }
  const browser = await chromium.launch();
  try {
    for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
      const ctx = await browser.newContext({ viewport, locale: "he-IL" });
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      const noScrollX = async (label) => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: בלי גלילה אופקית, ${label}`);

      await page.goto(BASE + "/#/");
      await page.waitForSelector(".hero .city", { timeout: 20000 });
      check((await page.locator(".board .row").count()) >= 1, `${name}: לוח ההמראות מציג הזדמנויות`);
      check(/\d/.test(await page.locator(".hero .price").innerText()), `${name}: מחיר בהזדמנות הראשית`);
      await noScrollX("בית");
      const second = (await page.locator(".board .row").nth(1).locator(".r-city").innerText()).split("\n")[0];
      await page.locator(".board .row").nth(1).click();
      await page.waitForTimeout(600);
      check((await page.locator(".hero .city").innerText()).trim() === second.trim(), `${name}: לחיצה על שורה בלוח מציגה את היעד בגדול`);
      check((await page.locator(".hero .kicker").count()) === 1 && (await page.locator(".hero .city").count()) === 1, `${name}: בלי כותרת כפולה על הקיר`);
      await page.screenshot({ path: `shots/${name}-home-pick.png` });
      await page.screenshot({ path: `shots/${name}-home.png` });

      await page.goto(BASE + "/#/map");
      await page.waitForSelector(".mk.deal, .mk.plain", { timeout: 30000 });
      await page.waitForTimeout(3500);
      await page.locator(".mk.deal, .mk.plain").first().click({ force: true });
      await page.waitForSelector(".offer", { timeout: 10000 });
      check((await page.locator(".offer img").count()) === 1, `${name}: לחיצה על יעד פותחת הצעה עם תמונה`);
      await page.waitForTimeout(2500);
      await noScrollX("מפה");
      await page.screenshot({ path: `shots/${name}-map.png` });

      await page.goto(BASE + "/#/year");
      await page.waitForSelector(".heat .cellb", { timeout: 20000 });
      await noScrollX("שנה");
      await page.screenshot({ path: `shots/${name}-year.png` });

      await page.goto(BASE + "/#/t/KRK/2027-02-07/2027-02-10");
      await page.waitForSelector(".tl li", { timeout: 60000 });
      await page.waitForSelector(".mk em", { timeout: 30000 });
      check((await page.locator(".mk em").count()) >= 2, `${name}: מסלול היום מסומן על המפה`);
      await page.waitForSelector(".tl img.ph", { timeout: 40000 }).catch(() => {});
      await page.waitForSelector(".tl-walk", { timeout: 30000 }).catch(() => {});
      check((await page.locator(".tl-walk").count()) >= 1 && !(await page.locator(".walk-sum span").count()), `${name}: מסלול הליכה ברחובות, עם מרחק וזמן בין עצירות`);
      check((await page.locator(".tl img.ph").count()) >= 1, `${name}: תמונות למקומות במסלול`);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `shots/${name}-trip.png`, fullPage: name === "mobile" });
      await page.locator(".tl .card").nth(1).click();
      await page.waitForTimeout(3500);
      check((await page.locator(".mk.on").count()) === 1, `${name}: לחיצה על מקום ממקדת את המפה`);
      check((await page.locator(".pcard h2").count()) === 1, `${name}: לחיצה על מקום פותחת כרטיס`);
      await page.waitForSelector(".pcard img.pcard-img", { timeout: 15000 }).catch(() => {});
      check((await page.locator(".pcard img.pcard-img").count()) === 1, `${name}: בכרטיס המקום תמונה גדולה`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `shots/${name}-focus.png` });
      await page.locator(".pcard .x").click();
      await page.locator(".tabs .chip", { hasText: "תאריכים" }).click();
      await page.waitForSelector(".cal-day.t4", { timeout: 20000 });
      check((await page.locator(".cal-month").count()) >= 3, `${name}: לוח שנה עם מחירים לכל יום`);
      await page.screenshot({ path: `shots/${name}-dates.png` });
      check((await page.locator('a[href*="booking.com"]').count()) >= 1, `${name}: קישור ל-Booking`);
      check((await page.locator('a[href*="calendar.google.com"]').count()) >= 1, `${name}: קישור ליומן`);
      await page.locator(".map3d-toggle .chip", { hasText: "לוויין" }).click();
      await page.waitForTimeout(5000);
      await noScrollX("טיול");
      await page.screenshot({ path: `shots/${name}-sat.png` });

      await page.goto(BASE + "/#/mine");
      await page.waitForSelector(".dest-chips .chip", { timeout: 20000 });
      await noScrollX("הטיולים שלי");
      await page.screenshot({ path: `shots/${name}-mine.png` });
      check(errors.length === 0, `${name}: בלי שגיאות בדפדפן ${errors.join(" | ")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
  if (fail.length) { console.error(`\nנכשלו ${fail.length} בדיקות`); process.exit(1); }
  console.log("\nכל הבדיקות עברו");
})().catch((e) => { console.error(e); process.exit(1); });
