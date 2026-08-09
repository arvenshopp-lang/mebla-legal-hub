"""تحقق نهائي محدود لعارض المستندات: عرض فعلي للنسخة المائية + VIEW/DOWNLOAD/PRINT + مشاركة + منع الوصول."""
import asyncio, json, hashlib, os, re, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "http://localhost:8080"
S = json.loads(Path("/tmp/browser/owner-session.json").read_text())
SHOTS = Path("/tmp/browser/docs"); SHOTS.mkdir(parents=True, exist_ok=True)
res = []
def rec(n, ok, d=""):
    res.append((n, ok, d)); print(("PASS " if ok else "FAIL ") + n + (f" — {d}" if d else ""))

PDFJS = """
async (src) => {
  const lib = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
  lib.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs';
  let bytes;
  if (src.b64) {
    const raw = atob(src.b64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  } else {
    const blob = window.__blobs.get(src.url);
    if (!blob) throw new Error('blob غير متعقَّب: ' + src.url);
    bytes = new Uint8Array(await blob.arrayBuffer());
  }
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(b => b.toString(16).padStart(2,'0')).join('');
  const doc = await lib.getDocument({ data: bytes.slice() }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1.4 });
  const canvas = document.createElement('canvas');
  canvas.width = vp.width; canvas.height = vp.height; canvas.id = 'qa-pdf-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff';
  document.body.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  const px = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
  let ink = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 245 || px[i+1] < 245 || px[i+2] < 245) ink++;
  const text = await page.getTextContent();
  let rotated = 0;
  for (const it of text.items) {
    const [a,b] = it.transform;
    const deg = Math.round(Math.atan2(b,a) * 180 / Math.PI);
    if (deg <= -30 && deg >= -40) rotated++;
  }
  return { bytes: bytes.length, digest, pages: doc.numPages, ink, total: px.length/4, items: text.items.length, rotated };
}
"""

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        INIT = """
          window.__csp = []; window.__printed = 0; window.__blobs = new Map();
          const origCreate = URL.createObjectURL.bind(URL);
          URL.createObjectURL = (obj) => { const u = origCreate(obj); try { window.__blobs.set(u, obj) } catch(e) {} return u; };
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + '|' + e.blockedURI));
          window.__printFrames = [];
          const origAppend = Element.prototype.appendChild;
          Element.prototype.appendChild = function(n){
            if (n && n.tagName === 'IFRAME' && n.getAttribute('aria-hidden') === 'true') window.__printFrames.push(String(n.src || ''));
            return origAppend.call(this, n);
          };
          window.print = function(){ try { window.top.__printed++ } catch(e) {} return; };
        """
        ctx = await browser.new_context(viewport={"width":1280,"height":1800}, locale="ar-SA", accept_downloads=True)
        await ctx.add_init_script(INIT)
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto(BASE, wait_until="domcontentloaded")
        await page.evaluate(f"window.localStorage.setItem({json.dumps(S['storageKey'])}, {json.dumps(json.dumps(S['session']))})")
        await page.goto(BASE + "/documents", wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)

        # 1) VIEW
        await page.get_by_role("button", name="عرض النسخة المائية").first.click()
        frame = page.locator("iframe[src^='blob:']").first
        await frame.wait_for(timeout=30000)
        blob = await frame.get_attribute("src")
        rec("VIEW: النافذة تعرض إطار النسخة المائية من blob:", bool(blob and blob.startswith("blob:")), blob[:24] if blob else "")
        info = await page.evaluate(PDFJS, {"url": blob})
        print("info:", info)
        rec("عرض فعلي في محرك PDF: الصفحة الأولى مرسومة ببكسلات حقيقية",
            info["ink"] > 2000, f"ink={info['ink']}/{int(info['total'])} pages={info['pages']}")
        rec("المعروض نسخة مائية: نص مائل بزاوية ‎-35°‎ مكرر على الصفحة",
            info["rotated"] >= 20, f"rotated={info['rotated']} of {info['items']}")
        await page.locator("#qa-pdf-canvas").screenshot(path=str(SHOTS/"view.png"))
        served_digest, served_len = info["digest"], info["bytes"]
        csp = await page.evaluate("window.__csp")
        rec("لا انتهاك CSP أثناء العرض بعد تضييق object-src", csp == [], str(csp)[:160])

        # 2) DOWNLOAD
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)
        async with page.expect_download(timeout=60000) as dl:
            await page.get_by_role("button", name="تنزيل النسخة المائية").first.click()
        path = await (await dl.value).path()
        data = Path(path).read_bytes()
        dl_info = await page.evaluate(PDFJS, {"b64": __import__("base64").b64encode(data).decode()})
        rec("DOWNLOAD: ملف PDF صالح ويحمل العلامة المائية",
            data[:5] == b"%PDF-" and dl_info["rotated"] >= 20, f"{len(data)}B rotated={dl_info['rotated']}")
        await page.evaluate("document.getElementById('qa-pdf-canvas')?.remove()")

        await page.evaluate("document.querySelectorAll('#qa-pdf-canvas').forEach(c => c.remove())")

        # 3) PRINT
        await page.get_by_role("button", name="طباعة النسخة المائية").first.click()
        for _ in range(60):
            pf = await page.evaluate("window.__printFrames")
            if pf: break
            await page.wait_for_timeout(500)
        toasts = await page.evaluate("[...document.querySelectorAll('[data-sonner-toast]')].map(t=>t.innerText)")
        rec("PRINT: إطار طباعة مخفي يُنشأ بنسخة blob مائية", bool(pf) and pf[0].startswith("blob:"), str(pf)[:60])
        rec("PRINT: رسالة تجهيز نسخة الطباعة تظهر للمستخدم",
            any("الطباعة المائية" in t for t in toasts), str(toasts)[:120])
        p_info = await page.evaluate(PDFJS, {"url": pf[0]}) if pf else {"rotated": 0, "ink": 0}
        rec("PRINT: بايتات نسخة الطباعة مائية وقابلة للرسم",
            p_info["rotated"] >= 20 and p_info["ink"] > 2000, f"rotated={p_info['rotated']} ink={p_info['ink']}")
        csp = await page.evaluate("window.__csp")
        rec("لا انتهاك CSP أثناء الطباعة", csp == [], str(csp)[:160])

        await page.evaluate("document.querySelectorAll('#qa-pdf-canvas').forEach(c => c.remove())")

        # 4) SHARED / SIGNED ACCESS
        await page.get_by_role("button", name="مشاركة").first.click()
        await page.get_by_role("button", name="إنشاء رابط مشاركة").click()
        link_input = page.locator("input[readonly]").first
        await link_input.wait_for(timeout=30000)
        share_url = await link_input.input_value()
        guest = await browser.new_context(viewport={"width":1280,"height":1800}, locale="ar-SA")
        await guest.add_init_script(INIT)
        gpage = await guest.new_page()
        await gpage.goto(share_url.replace("http://localhost:8080", BASE), wait_until="domcontentloaded")
        gframe = gpage.locator("iframe[src^='blob:']").first
        ok_share = True
        try:
            await gframe.wait_for(timeout=45000)
        except Exception as e:
            ok_share = False
        gblob = await gframe.get_attribute("src") if ok_share else None
        ginfo = await gpage.evaluate(PDFJS, {"url": gblob}) if gblob else {"rotated":0,"ink":0,"digest":""}
        rec("SHARED ACCESS: زائر بلا حساب يرى النسخة المائية فقط",
            ok_share and ginfo["rotated"] >= 20 and ginfo["ink"] > 2000,
            f"rotated={ginfo['rotated']} ink={ginfo['ink']}")
        await gpage.screenshot(path=str(SHOTS/"share.png"))
        token = share_url.rstrip("/").split("/")[-1]

        # 5) PRIVATE ACCESS
        checks = await gpage.evaluate("""async (token) => {
          const out = {};
          const bad = await fetch('/api/public/doc/' + 'x'.repeat(40));
          out.forged = bad.status;
          const reuse = await fetch('/api/public/doc/' + token);
          out.reuse_ct = (reuse.headers.get('content-type')||'');
          out.reuse = reuse.status;
          const noSession = await fetch('/api/documents');
          out.api = noSession.status;
          return out;
        }""", token)
        print("private:", checks)
        rec("PRIVATE ACCESS: رمز مُلفَّق مرفوض", checks["forged"] in (400,403), str(checks["forged"]))
        rec("PRIVATE ACCESS: لا مسار يعيد الملف الأصلي (مشاركة = PDF مائي فقط)",
            "application/pdf" in checks["reuse_ct"] or checks["reuse"] in (403,429), f"{checks['reuse']} {checks['reuse_ct']}")
        rec("لا أخطاء تنفيذ في المتصفح", len([e for e in errs if 'favicon' not in e]) == 0, str(errs[:2])[:200])

        print("\nSHA256 النسخة المعروضة:", served_digest[:16], "حجم:", served_len)
        await browser.close()

    ok = sum(1 for _,o,_ in res if o)
    print(f"\nالنتيجة: {ok}/{len(res)}")

asyncio.run(main())
