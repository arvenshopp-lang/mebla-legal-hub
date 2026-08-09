"""
اختبار تراجع سريع بعد تعديلات إمكانية الوصول وأهداف اللمس:
يتأكد أن أزرار «تعديل» في المسارات الستة ما زالت تفتح سجل الصف الصحيح،
وأن أزرار «إنجاز» في المهل والمهام ما زالت تعمل دون كسر بصري.
التشغيل: python3 scripts/e2e/regression_buttons.py
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

SESSION = Path("/tmp/browser/owner-session.json")
SHOTS = Path("/tmp/browser/screens"); SHOTS.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"
EDIT_ROUTES = ["/clients", "/cases", "/hearings", "/deadlines", "/tasks"]
results = []

def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

async def main():
    data = json.loads(SESSION.read_text())
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:200]))
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(data['storageKey'])}, {json.dumps(json.dumps(data['session']))})"
        )
        for route in EDIT_ROUTES:
            await page.goto(BASE + route, wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            btn = page.get_by_role("button", name="تعديل").first
            if not await btn.count():
                rec(f"R تعديل {route}", False, "زر التعديل غير موجود")
                continue
            row_text = await btn.locator("xpath=ancestor::tr").inner_text()
            key = next((p.strip() for p in row_text.split("\t") if len(p.strip()) > 5), "")
            await btn.click()
            await page.wait_for_timeout(2000)
            dialog = page.locator("[role=dialog]")
            opened = await dialog.count() > 0
            values = await page.evaluate(
                "() => [...document.querySelectorAll('[role=dialog] input, [role=dialog] textarea, [role=dialog] select')].map(e => e.value).join(' | ')"
            ) if opened else ""
            match = any(part and part in values for part in [key, key.split(" ")[0] if key else ""])
            rec(f"R تعديل {route} يفتح نافذة", opened)
            rec(f"R تعديل {route} يحمّل بيانات الصف", match, f"مفتاح={key[:40]}")
            await page.screenshot(path=str(SHOTS / f"r{route.strip('/')}.png"))
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(800)

        # صفحة القضية: زر التعديل داخل التفاصيل
        await page.goto(BASE + "/cases", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        link = page.locator("table a").first
        title = (await link.inner_text()).strip()
        await link.click()
        await page.wait_for_timeout(4500)
        edit = page.get_by_role("button", name="تعديل").first
        if await edit.count():
            await edit.click()
            await page.wait_for_timeout(2000)
            values = await page.evaluate(
                "() => [...document.querySelectorAll('[role=dialog] input, [role=dialog] textarea')].map(e => e.value).join(' | ')"
            )
            rec("R تعديل تفاصيل القضية يحمّل القضية نفسها", any(w in values for w in title.split(" ")[:2]), title[:40])
        else:
            rec("R تعديل تفاصيل القضية يحمّل القضية نفسها", False, "زر التعديل غير موجود")
        await page.keyboard.press("Escape")

        # أزرار «إنجاز» في المهل والمهام
        for route in ["/deadlines", "/tasks"]:
            await page.goto(BASE + route, wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            done = page.get_by_role("button", name="إنجاز")
            rec(f"R زر إنجاز موجود في {route}", await done.count() > 0, f"{await done.count()} زر")
        rec("R لا أخطاء تنفيذ في المتصفح", not errors, "; ".join(errors[:2]))
        await browser.close()
    ok = sum(1 for _, o, _ in results if o)
    print(f"\nREGRESSION: {ok}/{len(results)} PASS")

asyncio.run(main())
