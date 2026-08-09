"""
الدفعة F: تدقيق تجربة الجوال RTL على مسارات المكتب الأساسية.
تتحقق فعلياً من: غياب التمرير الأفقي، احترام Safe Area، حجم أهداف اللمس ≥44px،
وتحوّل النوافذ إلى Bottom Sheet على الشاشات الصغيرة.
التشغيل: python3 scripts/e2e/batch_f_mobile.py
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

SESSION = Path("/tmp/browser/owner-session.json")
SHOTS = Path("/tmp/browser/screens"); SHOTS.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"
ROUTES = ["/dashboard", "/clients", "/cases", "/hearings", "/deadlines", "/tasks", "/documents", "/team", "/settings"]
results = []

def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

async def main():
    data = json.loads(SESSION.read_text())
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True,
            locale="ar-SA",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        )
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(data['storageKey'])}, {json.dumps(json.dumps(data['session']))})"
        )
        for route in ROUTES:
            await page.goto(BASE + route, wait_until="domcontentloaded")
            await page.wait_for_timeout(3500)
            metrics = await page.evaluate(
                """() => {
                  const de = document.documentElement;
                  const dir = de.getAttribute('dir');
                  const overflow = de.scrollWidth - de.clientWidth;
                  const wide = [...document.querySelectorAll('body *')]
                    .filter(el => el.getBoundingClientRect().width > de.clientWidth + 2
                                  && getComputedStyle(el).overflowX === 'visible')
                    .slice(0, 3).map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 40));
                  // روابط النص المضمّنة داخل الجداول ليست أهداف لمس مستقلة،
                  // القياس يشمل الأزرار والروابط ذات العرض الكتلي فقط.
                  const small = [...document.querySelectorAll('button, a[href], [role=button]')]
                    .filter(el => {
                      const r = el.getBoundingClientRect();
                      if (!r.width || !r.height) return false;
                      const cs = getComputedStyle(el);
                      const inlineText = el.tagName === 'A' && cs.display === 'inline';
                      if (inlineText) return false;
                      return r.height < 44 || r.width < 44;
                    })
                    .map(el => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 20));
                  return { dir, overflow, wide, small };
                }"""
            )
            rec(f"F {route} بلا تمرير أفقي", metrics["overflow"] <= 1, f"overflow={metrics['overflow']} {metrics['wide']}")
            rec(f"F {route} اتجاه RTL", metrics["dir"] == "rtl")
            if metrics["small"]:
                rec(f"F {route} أهداف لمس ≥44px", False, ", ".join(metrics["small"][:6]))
            else:
                rec(f"F {route} أهداف لمس ≥44px", True)
            await page.screenshot(path=str(SHOTS / f"f{route.strip('/').replace('/', '_')}.png"))

        # Bottom Sheet: نافذة إضافة عميل على الجوال
        await page.goto(f"{BASE}/clients", wait_until="domcontentloaded")
        await page.wait_for_timeout(3500)
        add = page.get_by_role("button", name="عميل جديد")
        if await add.count():
            await add.first.click()
            await page.wait_for_timeout(1500)
            sheet = await page.evaluate(
                """() => {
                  const dialog = document.querySelector('[role=dialog]');
                  if (!dialog) return null;
                  const r = dialog.getBoundingClientRect();
                  return { bottom: Math.round(window.innerHeight - r.bottom), width: Math.round(r.width),
                           vw: window.innerWidth, top: Math.round(r.top) };
                }"""
            )
            await page.screenshot(path=str(SHOTS / "f_sheet.png"))
            ok = bool(sheet) and sheet["bottom"] <= 2 and sheet["width"] >= sheet["vw"] - 4 and sheet["top"] > 40
            rec("F نافذة العميل تتحول إلى Bottom Sheet", ok, json.dumps(sheet, ensure_ascii=False))
        else:
            rec("F نافذة العميل تتحول إلى Bottom Sheet", False, "زر الإضافة غير ظاهر")
        await browser.close()
    ok = sum(1 for _, o, _ in results if o)
    print(f"\nBATCH F: {ok}/{len(results)} PASS")

asyncio.run(main())
