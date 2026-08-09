"""
الدفعة E من جولة القبول البشري: رحلة الفريق داخل مكتب QA.
تُشغّل على المعاينة المحلية بجلسة مالك مكتب QA حقيقية:
  1) دعوة عضو جديد وظهورها في جدول الدعوات بحالة «معلّقة»
  2) تعديل دور عضو قائم وثبات التعديل بعد إعادة التحميل
  3) إلغاء الدعوة عبر نافذة التأكيد واختفاؤها من القائمة
التشغيل: bun scripts/e2e/mint-qa-session.ts (أو mint-owner) ثم python3 scripts/e2e/batch_e_team.py
"""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

SESSION = Path("/tmp/browser/owner-session.json")
SHOTS = Path("/tmp/browser/screens"); SHOTS.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:8080"
results = []

def rec(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

async def main():
    data = json.loads(SESSION.read_text())
    invite_email = f"qa.batch.e.{int(time.time())}@mehlaqa.test"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800}, locale="ar-SA")
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        page = await ctx.new_page()
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(data['storageKey'])}, {json.dumps(json.dumps(data['session']))})"
        )
        await page.goto(f"{BASE}/team", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)
        await page.screenshot(path=str(SHOTS / "e_team.png"))

        # 1) دعوة عضو جديد
        await page.get_by_role("button", name="دعوة عضو").click()
        await page.get_by_placeholder("user@example.com").fill(invite_email)
        await page.get_by_role("button", name="إنشاء الدعوة").click()
        await page.wait_for_timeout(6000)
        link_visible = await page.locator("code", has_text="/invite/").count() > 0
        rec("E1 نافذة الدعوة تُصدر رابط انضمام", link_visible)
        if link_visible:
            await page.get_by_role("button", name="تم").click()
        await page.wait_for_timeout(2500)
        row = page.locator("tr", has_text=invite_email)
        rec("E2 الدعوة تظهر في جدول الدعوات", await row.count() > 0)
        if await row.count():
            rec("E3 حالة الدعوة بانتظار القبول", "بانتظار القبول" in (await row.first.inner_text()))

        # 2) تعديل دور عضو قائم
        selects = page.locator("table select")
        changed = False
        if await selects.count():
            target_row = selects.first.locator("xpath=ancestor::tr")
            member_email = (await target_row.inner_text()).split("\n")[1] if "\n" in await target_row.inner_text() else ""
            current = await selects.first.input_value()
            new_role = "viewer" if current != "viewer" else "lawyer"
            await selects.first.select_option(new_role)
            await page.wait_for_timeout(4000)
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            persisted = await page.locator("table select").first.input_value()
            changed = persisted == new_role
            rec("E4 تعديل دور العضو يُحفظ بعد إعادة التحميل", changed, f"{current} → {persisted}")
            # إعادة الدور الأصلي حتى لا نغيّر بيانات مكتب QA
            await page.locator("table select").first.select_option(current)
            await page.wait_for_timeout(3000)
            rec("E5 استعادة الدور الأصلي", (await page.locator("table select").first.input_value()) == current, member_email[:0] or current)
        else:
            rec("E4 تعديل دور العضو يُحفظ بعد إعادة التحميل", False, "لا توجد قوائم أدوار قابلة للتعديل")

        # 3) إلغاء الدعوة
        row = page.locator("tr", has_text=invite_email)
        if await row.count():
            await row.first.get_by_role("button", name="إلغاء الدعوة").click()
            await page.get_by_role("button", name="تأكيد الإلغاء").click()
            await page.wait_for_timeout(4000)
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_timeout(4000)
            after = page.locator("tr", has_text=invite_email)
            text = await after.first.inner_text() if await after.count() else ""
            revoked = "ملغاة" in text
            still_actionable = await after.get_by_role("button", name="إلغاء الدعوة").count() if await after.count() else 0
            rec("E6 إلغاء الدعوة يحوّل حالتها إلى ملغاة", revoked, text.replace("\n", " | ")[:120])
            rec("E7 زر الإلغاء يختفي بعد الإلغاء", still_actionable == 0)
        else:
            rec("E6 إلغاء الدعوة يحوّل حالتها إلى ملغاة", False, "الدعوة غير موجودة")
        await page.screenshot(path=str(SHOTS / "e_team_end.png"))
        await browser.close()
    ok = sum(1 for _, o, _ in results if o)
    print(f"\nBATCH E: {ok}/{len(results)} PASS")

asyncio.run(main())
