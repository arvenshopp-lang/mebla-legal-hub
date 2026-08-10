"""
اختبار حي شامل لاستوديو التصميم (/mehla-admin/design) بجلسات حقيقية.

يغطّي: حفظ المسودة وفتحها بعد إعادة التحميل، القفل التفاؤلي، رفض CSS المحظور
برسائل عربية وأرقام أسطر، جسر المعاينة وثباته بعد التحويل الداخلي، التجاوب،
قيود دور «مصمم المنصة» على الحفظ والنشر والاسترجاع (واجهة + خادم)، ثم النشر
والاسترجاع مع إرجاع التصميم المنشور إلى حالته السابقة وتأكيد سجل التدقيق.

المتطلبات:
  bun scripts/e2e/design-studio-fixture.ts      # تهيئة الحسابات والجلسات
  SUPABASE_SERVICE_ROLE_KEY في البيئة           # للقراءة والتحقق من قاعدة البيانات

التشغيل: python3 scripts/e2e/design_studio_e2e.py
التنظيف: bun scripts/e2e/design-studio-fixture.ts --cleanup
"""

import asyncio, json, os, re, sys, time, urllib.request

from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
OUT = "/tmp/browser/design"
SESSIONS = "/tmp/browser/design-sessions.json"
STAMP = f"QA-DESIGN-{int(time.time())}"

PASS: list[str] = []
FAIL: list[str] = []


def check(no: int, title: str, ok: bool, detail: str = "") -> bool:
    line = f"{no:02d} {title}" + (f" — {detail}" if detail else "")
    (PASS if ok else FAIL).append(line)
    print(("PASS " if ok else "FAIL ") + line, flush=True)
    return ok


def env_file_value(name: str) -> str:
    with open(".env", encoding="utf-8") as f:
        for line in f:
            m = re.match(rf"\s*{name}\s*=\s*(.+?)\s*$", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    raise RuntimeError(f"{name} غير موجود في .env")


SUPABASE_URL = os.environ.get("SUPABASE_URL") or env_file_value("SUPABASE_URL")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_KEY:
    print("SUPABASE_SERVICE_ROLE_KEY غير متاح في البيئة — لا يمكن التحقق من قاعدة البيانات.")
    sys.exit(1)


def rest(path: str) -> list[dict]:
    """قراءة فقط من قاعدة البيانات للتحقق — لا كتابة على جداول التصميم."""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.loads(res.read().decode())


def publish_state() -> dict:
    rows = rest("design_publish_state?select=*")
    return rows[0] if rows else {}


# --------------------------- أدوات الواجهة ---------------------------


async def login(context, storage_key: str, session: dict, page=None):
    page = page or await context.new_page()
    page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await page.evaluate("([k,s])=>localStorage.setItem(k,JSON.stringify(s))", [storage_key, session])
    return page


async def open_studio(page):
    await page.goto(f"{BASE}/mehla-admin/design", wait_until="domcontentloaded")
    await page.wait_for_timeout(5500)


async def toasts(page) -> list[str]:
    return await page.evaluate(
        "()=>[...document.querySelectorAll('[data-sonner-toast]')].map(t=>t.textContent.trim())"
    )


async def clear_toasts(page):
    await page.evaluate("()=>document.querySelectorAll('[data-sonner-toast]').forEach(t=>t.remove())")


async def set_css(page, text: str):
    await page.get_by_role("button", name="CSS مخصص", exact=True).click()
    await page.wait_for_timeout(1200)
    editor = page.locator(".cm-content")
    await editor.wait_for(timeout=15000)
    await editor.click()
    await page.keyboard.press("Control+a")
    await page.keyboard.press("Delete")
    await page.keyboard.insert_text(text)
    await page.wait_for_timeout(600)


async def read_css(page) -> str:
    await page.get_by_role("button", name="CSS مخصص", exact=True).click()
    await page.wait_for_timeout(1200)
    return (await page.locator(".cm-content").inner_text()).replace("\u200b", "")


async def save_draft(page) -> list[str]:
    await clear_toasts(page)
    await page.get_by_role("button", name="حفظ مسودة فقط").click()
    await page.wait_for_timeout(4000)
    return await toasts(page)


async def preview_frame(page):
    await page.get_by_role("button", name="المعاينة", exact=True).click()
    await page.wait_for_timeout(1500)
    frame_el = page.locator('iframe[title="معاينة مسودة التصميم"]')
    await frame_el.wait_for(timeout=15000)
    await page.wait_for_timeout(6000)
    return await frame_el.element_handle()


# --------------------------- المراحل ---------------------------


async def owner_phase(browser, cfg):
    key, session = cfg["storageKey"], cfg["actors"]["owner"]["session"]
    ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await login(ctx, key, session)
    await open_studio(page)

    buttons = await page.evaluate(
        "()=>[...document.querySelectorAll('button')].map(b=>b.textContent.trim())"
    )
    check(
        1,
        "مالك المنصة يفتح الاستوديو بأزرار الحفظ والنشر والسجل",
        all(any(lbl in b for b in buttons) for lbl in ["حفظ مسودة فقط", "حفظ ونشر الآن", "سجل الإصدارات"]),
    )

    good_css = f".mehla-qa-mark{{outline:1px solid #C9A961}} /* {STAMP} */"
    await set_css(page, good_css)
    msgs = await save_draft(page)
    saved_ok = any("تم حفظ المسودة" in m for m in msgs)
    await open_studio(page)
    reopened = await read_css(page)
    check(
        2,
        "حفظ المسودة ثم فتحها بعد إعادة التحميل",
        saved_ok and STAMP in reopened,
        f"توست={msgs[:1]} وسم_موجود={STAMP in reopened}",
    )

    # القفل التفاؤلي: صفحتان محمّلتان على نفس الإصدار، الثانية يجب أن تُرفض
    page_b = await login(ctx, key, session)
    await open_studio(page_b)
    await set_css(page, f".mehla-qa-a{{color:#123C32}} /* {STAMP}-A */")
    a_msgs = await save_draft(page)
    await set_css(page_b, f".mehla-qa-b{{color:#123C32}} /* {STAMP}-B */")
    b_msgs = await save_draft(page_b)
    conflict = any(("عُدِّلت" in m) or ("تعارض" in m) or ("تعذّر" in m) for m in b_msgs)
    check(
        3,
        "القفل التفاؤلي يرفض الحفظ المتزامن المتأخر برسالة عربية",
        any("تم حفظ المسودة" in m for m in a_msgs) and conflict,
        f"A={a_msgs[:1]} B={b_msgs[:1]}",
    )
    await page_b.close()

    blocked_cases = [
        ("@import", '@import url("https://fonts.example.com/x.css");\n.a{color:red}'),
        ("url() خارجي", '.a{background:url("https://evil.example.com/x.png")}'),
        ("إخفاء تسجيل الخروج", '[data-testid="logout"]{display:none}'),
        ("z-index مفرط", ".a{position:fixed;z-index:2147483647}"),
    ]
    blocked_results = []
    for label, css in blocked_cases:
        await open_studio(page)
        await set_css(page, css)
        await save_draft(page)
        panel = await page.evaluate(
            """()=>[...document.querySelectorAll('li')].map(l=>l.textContent.trim())
                 .filter(t=>/غير مسموح|محظور|مسموح|سطر/.test(t))"""
        )
        flagged = bool(panel)
        has_line = any(re.search(r"سطر\s*\d+", t) for t in panel)
        blocked_results.append((label, flagged, has_line, panel[:1]))
    check(
        4,
        "CSS المحظور يُعلَم في المحرر برسالة عربية ورقم سطر من فحص الخادم",
        all(f for _, f, _, _ in blocked_results) and any(h for _, _, h, _ in blocked_results),
        "; ".join(f"{l}:{p[0] if p else 'بلا تحذير'}" for l, _, _, p in blocked_results),
    )

    # النشر يجب أن يُمنع طالما بقيت قاعدة محظورة في المسودة (واجهة + خادم)
    before_block = publish_state()
    pub_disabled = await page.evaluate(
        """()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('حفظ ونشر الآن'));
        return b?{disabled:b.disabled,title:b.title}:null;}"""
    )
    await clear_toasts(page)
    await page.evaluate(
        """()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('حفظ ونشر الآن'));
        if(b){b.disabled=false;b.click();}}"""
    )
    await page.wait_for_timeout(8000)
    after_block = publish_state()
    check(
        5,
        "النشر مرفوض ما دامت المسودة تحتوي قاعدة محظورة (زر معطّل ومنع خادمي)",
        bool(pub_disabled and pub_disabled["disabled"])
        and before_block.get("active_version_id") == after_block.get("active_version_id")
        and before_block.get("cache_version") == after_block.get("cache_version"),
        f"تلميح_الزر={pub_disabled and pub_disabled.get('title')}",
    )

    # إعادة المسودة إلى CSS صالح موسوم للجولة قبل مرحلة النشر
    await open_studio(page)
    await set_css(page, good_css)
    await save_draft(page)

    handle = await preview_frame(page)
    frame = await handle.content_frame()
    injected = ""
    for _ in range(10):
        frame = await handle.content_frame()
        injected = await frame.evaluate(
            "()=>{const s=document.getElementById('mehla-design-draft');return s?s.textContent:''}"
        )
        if STAMP in (injected or ""):
            break
        await page.wait_for_timeout(1500)
    check(
        6,
        "جسر المعاينة يحقن CSS المسودة داخل الصفحة الحقيقية",
        STAMP in (injected or ""),
        f"طول_الأنماط={len(injected or '')}",
    )

    await frame.evaluate("()=>{window.location.href='/?__design=1'}")
    await page.wait_for_timeout(7000)
    frame2 = await handle.content_frame()
    sticky = await frame2.evaluate(
        "()=>({url:location.pathname,has:!!document.getElementById('mehla-design-draft')})"
    )
    check(
        7,
        "وضع المعاينة ثابت بعد التحويل الداخلي ولا ينكسر الجسر",
        bool(sticky["has"]),
        f"المسار={sticky['url']}",
    )

    overflow = []
    for device in ["سطح المكتب", "تابلت", "جوال"]:
        await page.get_by_role("button", name=device, exact=True).click()
        await page.wait_for_timeout(3500)
        fr = await (await page.locator('iframe[title="معاينة مسودة التصميم"]').element_handle()).content_frame()
        m = await fr.evaluate(
            "()=>({sw:document.documentElement.scrollWidth,cw:document.documentElement.clientWidth})"
        )
        overflow.append((device, m["sw"] - m["cw"]))
    check(
        8,
        "لا تمرير أفقي داخل المعاينة على المقاسات الثلاثة",
        all(d <= 2 for _, d in overflow),
        "; ".join(f"{k}:{v}px" for k, v in overflow),
    )

    await page.get_by_role("button", name="سجل الإصدارات", exact=True).click()
    await page.wait_for_timeout(2500)
    body = await page.inner_text("body")
    check(9, "سجل الإصدارات يعرض الإصدار النشط", bool(re.search(r"#\d+", body)))
    await page.screenshot(path=f"{OUT}/owner.png")
    return ctx, page


async def designer_phase(browser, cfg):
    key = cfg["storageKey"]
    ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await login(ctx, key, cfg["actors"]["designer"]["session"])
    await open_studio(page)

    state = await page.evaluate(
        """()=>{const map={};for(const b of document.querySelectorAll('button')){const t=b.textContent.trim();
        for(const k of ['حفظ مسودة فقط','حفظ ونشر الآن','استرجاع آخر تصميم منشور'])
          if(t.includes(k)) map[k]=!b.disabled;}return map;}"""
    )
    msgs = await save_draft(page)
    check(
        10,
        "المصمم يرى الاستوديو ويحفظ مسودة بنجاح",
        state.get("حفظ مسودة فقط") is True and any("تم حفظ المسودة" in m for m in msgs),
        f"توست={msgs[:1]}",
    )
    check(
        11,
        "أزرار النشر والاسترجاع معطّلة للمصمم",
        state.get("حفظ ونشر الآن") is False and state.get("استرجاع آخر تصميم منشور") is False,
        json.dumps(state, ensure_ascii=False),
    )

    before = publish_state()
    for label in ["حفظ ونشر الآن", "استرجاع آخر تصميم منشور"]:
        await clear_toasts(page)
        await page.evaluate(
            """(label)=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes(label));
            if(b){b.disabled=false;b.click();}}""",
            label,
        )
        await page.wait_for_timeout(5000)
    after = publish_state()
    check(
        12,
        "تجاوز الواجهة لا يمنح المصمم نشراً أو استرجاعاً (المنع خادمي)",
        before.get("cache_version") == after.get("cache_version")
        and before.get("active_version_id") == after.get("active_version_id"),
        f"cache_version {before.get('cache_version')} → {after.get('cache_version')}",
    )
    await page.screenshot(path=f"{OUT}/designer.png")
    await ctx.close()

    ctx2 = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page2 = await login(ctx2, key, cfg["actors"]["plain"]["session"])
    await page2.goto(f"{BASE}/mehla-admin", wait_until="domcontentloaded")
    await page2.wait_for_timeout(5000)
    nav = await page2.inner_text("body")
    await page2.goto(f"{BASE}/mehla-admin/design", wait_until="domcontentloaded")
    await page2.wait_for_timeout(5000)
    denied = await page2.inner_text("body")
    has_link = "مظهر المنصة" in nav
    blocked_page = await page2.evaluate(
        """()=>!document.querySelector('.cm-content') &&
             ![...document.querySelectorAll('button')].some(b=>b.textContent.includes('حفظ مسودة فقط'))"""
    )
    check(
        13,
        "موظف بلا صلاحية تصميم لا يرى الرابط ويُمنع من المحرر",
        (not has_link) and blocked_page,
        f"رابط_في_القائمة={has_link} محرر_ظاهر={not blocked_page} مقتطف={denied[:120]!r}",
    )
    await page2.screenshot(path=f"{OUT}/plain.png")
    await ctx2.close()


async def publish_phase(page):
    before = publish_state()
    await open_studio(page)
    await clear_toasts(page)
    await page.get_by_role("button", name="حفظ ونشر الآن").click()
    await page.wait_for_timeout(9000)
    published = publish_state()
    msgs = await toasts(page)
    check(
        14,
        "النشر ينشئ إصداراً جديداً ويرفع نسخة الذاكرة ويمنح حق الاسترجاع",
        published.get("active_version_id") != before.get("active_version_id")
        and (published.get("cache_version") or 0) > (before.get("cache_version") or 0)
        and published.get("rollback_available") is True,
        f"cache_version {before.get('cache_version')} → {published.get('cache_version')} توست={msgs[:1]}",
    )

    await open_studio(page)
    await clear_toasts(page)
    await page.get_by_role("button", name="استرجاع آخر تصميم منشور").click()
    await page.wait_for_timeout(9000)
    rolled = publish_state()
    check(
        15,
        "الاسترجاع يعيد الإصدار السابق ويستهلك حق الاسترجاع",
        rolled.get("active_version_id") == before.get("active_version_id")
        and (rolled.get("cache_version") or 0) > (published.get("cache_version") or 0)
        and rolled.get("rollback_used_at") is not None,
        f"الإصدار النشط عاد={rolled.get('active_version_id') == before.get('active_version_id')}",
    )
    check(
        16,
        "التصميم المنشور عاد إلى حالته قبل الاختبار",
        rolled.get("active_version_id") == before.get("active_version_id"),
    )

    actions = {r["action"] for r in rest("design_audit_logs?select=action,created_at&order=created_at.desc&limit=40")}
    check(
        17,
        "سجل التدقيق يوثّق الحفظ والنشر والاسترجاع",
        {"save_draft", "publish", "rollback"} <= actions,
        ", ".join(sorted(actions)),
    )


async def main():
    os.makedirs(OUT, exist_ok=True)
    with open(SESSIONS, encoding="utf-8") as f:
        cfg = json.load(f)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx, page = await owner_phase(browser, cfg)
        await designer_phase(browser, cfg)
        await publish_phase(page)
        await ctx.close()
        await browser.close()

    print("\n================ النتيجة ================")
    print(f"PASS = {len(PASS)}   FAIL = {len(FAIL)}")
    for line in FAIL:
        print("  FAIL:", line)
    sys.exit(1 if FAIL else 0)


asyncio.run(main())
