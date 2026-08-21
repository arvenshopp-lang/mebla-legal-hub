"""
MEHLA · تدقيق شبكة الخطوط (E2E)
يفحص مسارات المنصة — وأهمها /dashboard وما تحتها — ويتحقق من:
  1) لا طلبات لخطوط خارجية (Google Fonts / gstatic / typekit / CDN خطوط).
  2) لا طلب ملف خط بحالة 404 أو أي حالة غير 200/304.
  3) لا تحميل مزدوج شبكي لأي ملف خط (التكرار من الذاكرة/الكاش مسموح).
  4) لا أي ملف ibm-plex-*.
  5) أوزان الرسم الأول 400 و700 محمّلة مسبقاً وتستخدم block لمنع تبديل مرئي.
التشغيل: python3 scripts/e2e/fonts_network_e2e.py
الجلسة: تُستعاد تلقائياً من متغيرات معاينة Lovable إن وُجدت؛ بدونها
تُدقّق المسارات العامة فقط ويظهر تحذير واضح للمسارات المحمية.
"""

import asyncio
import json
import os
import sys
from collections import defaultdict

from playwright.async_api import async_playwright

BASE = os.environ.get("MEHLA_BASE_URL", "http://localhost:8080")
PUBLIC_ROUTES = ["/", "/login", "/register", "/about", "/faq", "/security"]
AUTHED_ROUTES = ["/dashboard", "/clients", "/cases", "/hearings", "/deadlines", "/tasks", "/documents", "/team", "/settings"]
EXTERNAL_FONT_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net", "fonts.bunny.net", "cdn.jsdelivr.net", "unpkg.com")
FONT_EXT = (".woff2", ".woff", ".ttf", ".otf", ".eot")

results = []


def record(ok: bool, label: str, detail: str = "") -> None:
    results.append((ok, label, detail))
    print(("PASS  " if ok else "FAIL  ") + label + (f" — {detail}" if detail else ""))


async def restore_session(context, page) -> bool:
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        await context.add_cookies([{**c, "url": BASE} for c in json.loads(cookies)])
    key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if not (key and session):
        return bool(cookies)
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate(f"localStorage.setItem({json.dumps(key)}, {json.dumps(session)})")
    return True


async def audit_route(context, path: str, expect_authed: bool) -> None:
    page = await context.new_page()
    font_requests = defaultdict(int)
    external = []
    bad_status = []

    def on_response(res):
        url = res.url
        if any(h in url for h in EXTERNAL_FONT_HOSTS):
            external.append(f"{url} [{res.status}]")
            return
        if url.endswith(FONT_EXT):
            font_requests[url.split("/")[-1]] += 1
            if res.status not in (200, 304):
                bad_status.append(f"{url.split('/')[-1]} [{res.status}]")

    page.on("response", on_response)
    await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    final = page.url.replace(BASE, "") or "/"
    await page.close()

    label = f"{path}"
    if expect_authed and final.startswith("/login"):
        record(False, f"{label} · جلسة", f"تحويل إلى {final} — لا جلسة نشطة")
        return

    record(not external, f"{label} · لا خطوط خارجية", ", ".join(external))
    record(not bad_status, f"{label} · جميع ملفات الخطوط 200/304", ", ".join(bad_status))
    dupes = [f"{n}×{c}" for n, c in font_requests.items() if c > 1]
    record(not dupes, f"{label} · لا تحميل مزدوج شبكي", ", ".join(dupes))
    ibm = [n for n in font_requests if "ibm-plex" in n]
    record(not ibm, f"{label} · لا ملفات ibm-plex", ", ".join(ibm))


async def audit_cold_font_render(browser) -> None:
    context = await browser.new_context(viewport={"width": 390, "height": 844})
    page = await context.new_page()
    client = await context.new_cdp_session(page)
    await client.send("Network.enable")
    await client.send(
        "Network.emulateNetworkConditions",
        {
            "offline": False,
            "latency": 150,
            "downloadThroughput": 200_000,
            "uploadThroughput": 100_000,
            "connectionType": "cellular4g",
        },
    )
    await page.goto(BASE, wait_until="domcontentloaded")
    preloads = await page.locator('link[rel="preload"][as="font"]').evaluate_all(
        "links => links.map(link => link.getAttribute('href'))"
    )
    record(
        "/fonts/plex-arabic-400.woff2" in preloads
        and "/fonts/plex-arabic-700.woff2" in preloads,
        "/ · preload للأوزان الحرجة",
    )
    displays = await page.evaluate(
        """() => [...document.fonts]
          .filter(face => face.family.includes('IBM Plex Sans Arabic'))
          .map(face => face.display)"""
    )
    record(bool(displays) and all(value == "block" for value in displays), "/ · منع تبديل الخط المرئي")
    await page.evaluate("document.fonts.ready")
    heading = page.locator("h1").first
    family = await heading.evaluate("node => getComputedStyle(node).fontFamily")
    weight = await heading.evaluate("node => getComputedStyle(node).fontWeight")
    record("IBM Plex Sans Arabic" in family and weight == "700", "/ · وزن العنوان النهائي", f"{family} / {weight}")
    await context.close()


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        has_session = await restore_session(context, page)
        await page.close()

        await audit_cold_font_render(browser)

        for route in PUBLIC_ROUTES:
            await audit_route(context, route, expect_authed=False)

        if has_session:
            for route in AUTHED_ROUTES:
                await audit_route(context, route, expect_authed=True)
        else:
            print("\nتحذير: لا جلسة معاينة محقونة — تعذّر تدقيق المسارات المحمية:")
            print("  " + ", ".join(AUTHED_ROUTES))

        await browser.close()

    passed = sum(1 for ok, _, _ in results if ok)
    failed = len(results) - passed
    print(f"\nPASS = {passed} · FAIL = {failed}")
    if not has_session:
        print("النتيجة جزئية: المسارات المحمية غير مُدقّقة.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
