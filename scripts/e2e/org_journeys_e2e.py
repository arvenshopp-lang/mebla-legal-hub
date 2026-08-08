"""رحلات المكتب الأساسية (E2E) عبر الواجهة الفعلية بحساب مالك مكتب QA.

تسجيل دخول → عميل → قضية → جلسة → مهلة → مهمة → مستند، مع تأكيد ظهور كل صف
في القائمة وبعد إعادة التحميل، والتحقق من عدم وجود Toast نجاح بلا بيان حقيقي.

التشغيل: python3 scripts/e2e/org_journeys_e2e.py   (بعد bun scripts/e2e/org-qa-fixture.ts)
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

APP = os.environ.get("APP_ORIGIN", "http://localhost:8080")
QA_FILE = Path("/tmp/browser/qa-org.json")
SHOTS = Path("/tmp/browser/journeys")
SHOTS.mkdir(parents=True, exist_ok=True)

STAMP = "QA-E2E-20260808"
results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS — " if ok else "FAIL — ") + name + ("" if ok else f" :: {detail}"))


async def fill_by_label(page, label, value):
    field = page.get_by_label(label)
    await field.first.fill(value)


async def main():
    qa = json.loads(QA_FILE.read_text())
    owner = next(a for a in qa["accounts"] if a["role"] == "owner")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        console_errors = []
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )

        page_errors = []
        page.on("pageerror", lambda e: page_errors.append(str(e)[:300]))

        # 1) تسجيل الدخول عبر النموذج الفعلي (بعد اكتمال Hydration)
        await page.goto(f"{APP}/login", wait_until="load")
        await page.wait_for_timeout(2000)
        await page.locator('input[type="email"]').fill(owner["email"])
        await page.locator('input[type="password"]').fill(qa["password"])
        await page.locator('button[type="submit"]').first.click()
        try:
            await page.wait_for_url("**/dashboard", timeout=25000)
            record("تسجيل الدخول بحساب مالك المكتب", True)
        except Exception as exc:
            await page.screenshot(path=str(SHOTS / "login_failed.png"))
            record(
                "تسجيل الدخول بحساب مالك المكتب",
                False,
                f"{page.url} {exc} | console={console_errors[:3]} | pageerror={page_errors[:2]}",
            )
            await browser.close()
            return finish()
        await page.screenshot(path=str(SHOTS / "01_dashboard.png"))

        # 2) عميل جديد
        client_name = f"{STAMP} عميل الرحلة"
        await page.goto(f"{APP}/clients", wait_until="domcontentloaded")
        await page.get_by_role("button", name="عميل جديد").first.click()
        await fill_by_label(page, "الاسم الكامل", client_name)
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "02_client_saved.png"))
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        ok = await page.get_by_text(client_name).count() > 0
        record("إنشاء عميل يظهر في القائمة بعد إعادة التحميل", ok, page.url)

        # 3) قضية جديدة
        case_title = f"{STAMP} قضية الرحلة"
        await page.goto(f"{APP}/cases", wait_until="domcontentloaded")
        await page.get_by_role("button", name="قضية جديدة").first.click()
        await fill_by_label(page, "عنوان القضية", case_title)
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "03_case_saved.png"))
        await page.reload(wait_until="domcontentloaded")
        await page.wait_for_timeout(2500)
        ok = await page.get_by_text(case_title).count() > 0
        record("إنشاء قضية يظهر في القائمة بعد إعادة التحميل", ok, page.url)

        # 4) جلسة مرتبطة بالقضية
        hearing_title = f"{STAMP} جلسة الرحلة"
        await page.goto(f"{APP}/hearings", wait_until="load")
        await page.wait_for_timeout(1500)
        await page.get_by_role("button", name="جلسة جديدة").first.click()
        await page.get_by_label("القضية").first.select_option(label=case_title)
        await fill_by_label(page, "عنوان الجلسة", hearing_title)
        await page.get_by_label("التاريخ والوقت").first.fill("2026-09-10T10:00")
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(2500)
        await page.reload(wait_until="load")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "04_hearing_saved.png"))
        ok = await page.get_by_text(hearing_title).count() > 0
        record("إنشاء جلسة تظهر بعد إعادة التحميل", ok, page.url)

        # 5) مهلة
        deadline_title = f"{STAMP} مهلة الرحلة"
        await page.goto(f"{APP}/deadlines", wait_until="load")
        await page.wait_for_timeout(1500)
        await page.get_by_role("button", name="مهلة جديدة").first.click()
        await fill_by_label(page, "العنوان", deadline_title)
        await page.get_by_label("تاريخ الاستحقاق").first.fill("2026-09-20T09:00")
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(2500)
        await page.reload(wait_until="load")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "05_deadline_saved.png"))
        ok = await page.get_by_text(deadline_title).count() > 0
        record("إنشاء مهلة تظهر بعد إعادة التحميل", ok, page.url)

        # 6) مهمة
        task_title = f"{STAMP} مهمة الرحلة"
        await page.goto(f"{APP}/tasks", wait_until="load")
        await page.wait_for_timeout(1500)
        await page.get_by_role("button", name="مهمة جديدة").first.click()
        await fill_by_label(page, "العنوان", task_title)
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(2500)
        await page.reload(wait_until="load")
        await page.wait_for_timeout(2500)
        await page.screenshot(path=str(SHOTS / "06_task_saved.png"))
        ok = await page.get_by_text(task_title).count() > 0
        record("إنشاء مهمة تظهر بعد إعادة التحميل", ok, page.url)

        # 7) رفع مستند فعلي (PDF صغير)
        pdf = SHOTS / f"{STAMP}-doc.pdf"
        pdf.write_bytes(
            b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n"
            b"trailer<</Root 1 0 R>>\n%%EOF\n"
        )
        await page.goto(f"{APP}/documents", wait_until="load")
        await page.wait_for_timeout(1500)
        await page.get_by_role("button", name="رفع مستند").first.click()
        await page.locator('input[type="file"]').first.set_input_files(str(pdf))
        await page.get_by_role("button", name="حفظ").first.click()
        await page.wait_for_timeout(6000)
        await page.reload(wait_until="load")
        await page.wait_for_timeout(3000)
        await page.screenshot(path=str(SHOTS / "07_document_saved.png"))
        ok = await page.get_by_text(pdf.name).count() > 0
        record("رفع مستند يظهر في القائمة بعد إعادة التحميل", ok, page.url)

        blocking = [e for e in console_errors if "favicon" not in e]
        record("لا أخطاء Console خلال الرحلة", not blocking, "; ".join(blocking[:3]))
        await browser.close()
    finish()


def finish():
    failed = [r for r in results if not r[1]]
    print(f"\nالنتيجة: {len(results) - len(failed)}/{len(results)} PASS")
    sys.exit(1 if failed else 0)


asyncio.run(main())
