"""
اختبار حي لتنقل وصلاحيات لوحة /mehla-admin.

الفكرة: جلسة حقيقية لمالك المنصة في المعاينة، ثم لكل دور من الأدوار الثمانية
يُعاد كتابة صف `platform_staff` القادم من الشبكة بصلاحيات القالب فقط
(اعتراض شبكي، دون أي تعديل على بيانات الإنتاج). بذلك نتحقق فعلياً من:
  1) عناصر القائمة الظاهرة = المتوقع من مصدر الحقيقة في الكود.
  2) بوابة العرض المركزية تمنع المسارات الممنوعة برسالة عربية واضحة تحمل اسم الصلاحية.
  3) لا تمرير أفقي على 320px و390px، وقائمة الجوال تفتح وتُغلق بـ Esc.

وضعان للتشغيل:
  1) جلسة معاينة حقيقية محقونة (LOVABLE_BROWSER_AUTH_STATUS=injected) — الوضع المفضّل.
  2) وضع جلسة اختبار محلية (RBAC_E2E_STUB=1): تُحقن جلسة اصطناعية في المتصفح
     ويُعترض ردّ `/auth/v1/user` وصف `platform_staff` بالكامل. لا يلامس بيانات
     الإنتاج ولا يمنح أي وصول خادمي حقيقي؛ يختبر فقط بوابة العرض والقائمة
     (وهي منطق عميل صرف)، والحماية الخادمية تبقى مثبتة بمسار آخر.

التشغيل: python3 scripts/e2e/rbac_nav_e2e.py
"""

import asyncio, json, os, re, subprocess, sys, time
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = "/tmp/browser/rbac"
STAFF_URL_PART = "/rest/v1/platform_staff"
STUB = os.environ.get("RBAC_E2E_STUB") == "1"
STUB_USER_ID = "00000000-0000-4000-8000-00000000qa01".replace("qa", "aa")


def env_file_value(name: str) -> str:
    with open(".env", encoding="utf-8") as f:
        for line in f:
            m = re.match(rf"\s*{name}\s*=\s*(.+?)\s*$", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError(f"{name} غير موجود في .env")


def stub_session_json(project_id: str) -> tuple[str, str]:
    """(مفتاح التخزين، جسم الجلسة) — توكن اصطناعي غير صالح خادمياً بشكل مقصود."""
    key = f"sb-{project_id}-auth-token"
    expires_at = int(time.time()) + 3600
    session = {
        "access_token": "rbac-e2e-stub-token",
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": expires_at,
        "refresh_token": "rbac-e2e-stub-refresh",
        "user": {
            "id": STUB_USER_ID,
            "aud": "authenticated",
            "role": "authenticated",
            "email": "rbac.e2e@local.test",
            "app_metadata": {},
            "user_metadata": {},
            "created_at": "2026-01-01T00:00:00Z",
        },
    }
    return key, json.dumps(session)


def expectations():
    raw = subprocess.run(
        ["bun", "scripts/rbac-nav-expect.ts"], capture_output=True, text=True, check=True
    ).stdout
    return json.loads(raw)


async def restore_session(context, page):
    if STUB:
        project_id = env_file_value("VITE_SUPABASE_PROJECT_ID")
        key, session = stub_session_json(project_id)

        async def stub_user(route):
            body = json.loads(session)["user"]
            await route.fulfill(
                status=200, content_type="application/json", body=json.dumps(body)
            )

        await page.route("**/auth/v1/user**", stub_user)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate("([k, v]) => localStorage.setItem(k, v)", [key, session])
        return
    cj = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cj:
        await context.add_cookies([{**c, "url": BASE} for c in json.loads(cj)])
    await page.goto(BASE, wait_until="domcontentloaded")
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if key and sj:
        await page.evaluate(
            "([k, v]) => localStorage.setItem(k, v)", [key, sj]
        )


async def run_role(context, role, total_items, failures):
    page = await context.new_page()
    await restore_session(context, page)

    async def handle(route):
        if STUB:
            row = {
                "id": "00000000-0000-4000-8000-0000000000ff",
                "user_id": STUB_USER_ID,
                "full_name": "حساب اختبار الصلاحيات",
                "email": "rbac.e2e@local.test",
                "job_title": None,
                "status": "active",
                "role": "super_admin" if role["isSuperAdmin"] else "staff",
                "permissions": [],
                "role_id": None,
                "platform_roles": None
                if role["isSuperAdmin"]
                else {"name_ar": role["name_ar"], "permissions": role["permissions"]},
            }
            await route.fulfill(
                status=200, content_type="application/json", body=json.dumps(row)
            )
            return
        response = await route.fetch()
        try:
            body = await response.json()
        except Exception:
            await route.fulfill(response=response)
            return
        rows = body if isinstance(body, list) else [body]
        for row in rows:
            if not isinstance(row, dict):
                continue
            row["role"] = "super_admin" if role["isSuperAdmin"] else "staff"
            row["permissions"] = []
            row["role_id"] = None
            row["platform_roles"] = None if role["isSuperAdmin"] else {
                "name_ar": role["name_ar"],
                "permissions": role["permissions"],
            }
        await route.fulfill(
            response=response,
            body=json.dumps(rows if isinstance(body, list) else rows[0]),
            headers={**response.headers, "content-length": ""},
        )

    await page.route(f"**{STAFF_URL_PART}**", handle)

    # 1) القائمة على سطح المكتب
    await page.set_viewport_size({"width": 1280, "height": 1800})
    await page.goto(f"{BASE}/mehla-admin", wait_until="domcontentloaded")
    await page.wait_for_selector('nav[aria-label="تنقل لوحة الإدارة"]', timeout=15000)
    await page.wait_for_timeout(800)
    hrefs = await page.eval_on_selector_all(
        'nav[aria-label="تنقل لوحة الإدارة"] a[href]',
        "els => els.map(e => new URL(e.href).pathname)",
    )
    seen = sorted({h for h in hrefs if h.startswith("/mehla-admin")})
    expected = sorted(set(role["visiblePaths"]))
    extra = [p for p in seen if p not in expected]
    missing = [p for p in expected if p not in seen]
    if extra:
        failures.append(f"{role['code']}: عناصر ظاهرة بلا صلاحية → {extra}")
    if missing:
        failures.append(f"{role['code']}: عناصر مفقودة رغم الصلاحية → {missing}")
    await page.screenshot(path=f"{OUT}/{role['code']}-desktop.png")

    # 2) المسارات الممنوعة
    for sample in role["deniedSamples"]:
        await page.goto(f"{BASE}{sample['path']}", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)
        text = await page.inner_text("main")
        if "لا تملك صلاحية الوصول إلى هذه الصفحة" not in text:
            failures.append(f"{role['code']}: {sample['path']} لم يُمنع بالبوابة المركزية")
        elif sample["permissionLabel"] not in text:
            failures.append(
                f"{role['code']}: {sample['path']} لا يذكر اسم الصلاحية «{sample['permissionLabel']}»"
            )
    if role["deniedSamples"]:
        await page.screenshot(path=f"{OUT}/{role['code']}-denied.png")

    # 3) الجوال: تمرير أفقي + قائمة + Esc
    await page.goto(f"{BASE}/mehla-admin", wait_until="domcontentloaded")
    for width in (320, 390):
        await page.set_viewport_size({"width": width, "height": 780})
        await page.wait_for_timeout(400)
        overflow = await page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        if overflow > 1:
            failures.append(f"{role['code']}: تمرير أفقي {overflow}px عند {width}px")
    await page.get_by_role("button", name="فتح القائمة").click()
    await page.wait_for_selector('aside[aria-label="قائمة لوحة الإدارة"]', timeout=5000)
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(400)
    if await page.locator('aside[aria-label="قائمة لوحة الإدارة"]').count() != 0:
        failures.append(f"{role['code']}: قائمة الجوال لا تُغلق بـ Esc")
    await page.screenshot(path=f"{OUT}/{role['code']}-mobile.png")

    print(
        f"✓ {role['name_ar']} ({role['code']}): {len(seen)}/{total_items} عنصر | "
        f"ممنوع مُختبر: {len(role['deniedSamples'])}"
    )
    await page.close()


async def main():
    if not STUB and os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        print(
            "لا توجد جلسة مُحقنة في المعاينة — سجّل الدخول داخل نافذة المعاينة، "
            "أو شغّل بوضع الجلسة المحلية: RBAC_E2E_STUB=1"
        )
        return 2
    os.makedirs(OUT, exist_ok=True)
    data = expectations()
    failures: list[str] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role in data["roles"]:
            context = await browser.new_context(viewport={"width": 1280, "height": 1800})
            try:
                await run_role(context, role, data["totalItems"], failures)
            finally:
                await context.close()
        await browser.close()
    if failures:
        print(f"\n✗ {len(failures)} مخالفة:")
        for f in failures:
            print(f" - {f}")
        return 1
    print("\n✓ التنقل والبوابة المركزية والجوال سليمة لكل الأدوار المختبرة")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
