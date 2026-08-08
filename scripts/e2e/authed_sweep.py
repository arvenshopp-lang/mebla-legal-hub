"""مسح مصادق للمسارات الإدارية ومسارات المكتب على خمسة مقاسات.

يقيس: أخطاء الـ Console، فشل الشبكة، التمرير الأفقي على مستوى الصفحة،
واتجاه RTL. يعمل على دفعات لتفادي مهلة التنفيذ:
    python3 scripts/e2e/authed_sweep.py <start> <count>
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
ROOT = Path("/dev-server")
OUT = Path("/tmp/browser/sweep")
OUT.mkdir(parents=True, exist_ok=True)
VIEWPORTS = [320, 390, 768, 1024, 1440]
IGNORE_CONSOLE = ("Download the React DevTools", "[vite]", "hmr")


def routes() -> list[str]:
    paths = []
    for folder, prefix in (("mehla-admin", "/mehla-admin"), ("_authenticated", "")):
        base = ROOT / "src/routes" / folder
        for f in sorted(base.rglob("*.tsx")):
            name = f.relative_to(base).as_posix()[: -len(".tsx")]
            if name == "route" or "$" in name:
                continue
            name = name.replace(".index", "").replace("/index", "")
            seg = "" if name in ("index", "") else "/" + name.replace(".", "/")
            paths.append((prefix + seg) or "/")
    # إزالة التكرار مع الحفاظ على الترتيب
    return list(dict.fromkeys(paths))


async def main() -> int:
    start = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    all_routes = routes()
    batch = all_routes[start : start + count]
    print(f"إجمالي المسارات: {len(all_routes)} — هذه الدفعة: {start}..{start + len(batch) - 1}")

    creds = json.loads(Path("/tmp/browser/qa-session.json").read_text())
    findings = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for width in VIEWPORTS:
            context = await browser.new_context(viewport={"width": width, "height": 1800})
            page = await context.new_page()
            errors: list[str] = []
            page.on(
                "console",
                lambda m: errors.append(m.text[:300])
                if m.type == "error" and not any(s in m.text for s in IGNORE_CONSOLE)
                else None,
            )
            page.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:300]}"))
            await page.goto(BASE, wait_until="domcontentloaded")
            await page.evaluate(
                "([k, s]) => window.localStorage.setItem(k, JSON.stringify(s))",
                [creds["storageKey"], creds["session"]],
            )
            for route in batch:
                errors.clear()
                try:
                    await page.goto(BASE + route, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(1600)
                    metrics = await page.evaluate(
                        """() => ({
                          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                          dir: document.documentElement.dir,
                          url: location.pathname,
                          text: (document.body.innerText || '').slice(0, 200),
                        })"""
                    )
                except Exception as exc:  # noqa: BLE001
                    findings.append((route, width, f"تعذّر التحميل: {str(exc)[:120]}"))
                    continue
                if metrics["url"].startswith("/login"):
                    findings.append((route, width, "أعاد التوجيه إلى /login — جلسة غير فعّالة"))
                if metrics["scroll"] > 2:
                    findings.append((route, width, f"تمرير أفقي {metrics['scroll']}px"))
                if metrics["dir"] != "rtl":
                    findings.append((route, width, f"اتجاه غير RTL: {metrics['dir']}"))
                if errors:
                    findings.append((route, width, f"Console: {errors[0]}"))
                status = "OK" if not any(f[0] == route and f[1] == width for f in findings) else "!!"
                print(f"{status} {width:>4}px {route}")
                if status == "!!":
                    await page.screenshot(
                        path=str(OUT / f"{route.strip('/').replace('/', '_') or 'root'}-{width}.png")
                    )
            await context.close()
        await browser.close()

    print("\n=== النتيجة ===")
    if not findings:
        print(f"لا مخالفات في هذه الدفعة ({len(batch)} مسار × {len(VIEWPORTS)} مقاس).")
        return 0
    for route, width, msg in findings:
        print(f"FAIL {width}px {route} → {msg}")
    return 1


sys.exit(asyncio.run(main()))
