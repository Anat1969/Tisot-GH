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
      await page.screenshot({ path: `shots/${name}-home.png` });

      await page.goto(BASE + "/#/map");
      await page.waitForSelector(".pin", { timeout: 20000 });
      await page.waitForTimeout(1500);
      await noScrollX("מפה");
      await page.screenshot({ path: `shots/${name}-map.png` });

      await page.goto(BASE + "/#/year");
      await page.waitForSelector(".heat .cellb", { timeout: 20000 });
      await noScrollX("שנה");
      await page.screenshot({ path: `shots/${name}-year.png` });

      await page.goto(BASE + "/#/t/KRK/2027-02-07/2027-02-10");
      await page.waitForSelector(".stops li", { timeout: 60000 });
      check((await page.locator(".pin.stop").count()) >= 2, `${name}: מסלול היום מסומן על המפה`);
      check((await page.locator('a[href*="booking.com"]').count()) >= 1, `${name}: קישור ל-Booking`);
      check((await page.locator('a[href*="calendar.google.com"]').count()) >= 1, `${name}: קישור ליומן`);
      await page.locator(".lmap-toggle .chip", { hasText: "לוויין" }).click();
      await page.waitForTimeout(2000);
      await noScrollX("טיול");
      await page.screenshot({ path: `shots/${name}-trip.png`, fullPage: name === "mobile" });

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
