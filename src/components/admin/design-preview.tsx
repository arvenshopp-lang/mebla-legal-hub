/**
 * معاينة تصميم آمنة — إطار معزول ببيانات تجريبية فقط.
 * لا يتصل بقاعدة البيانات، ولا يعرض بيانات عملاء حقيقية، ولا ينفّذ أي عملية.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Tablet, Smartphone, RefreshCw, SplitSquareHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const DEVICES = {
  desktop: { label: "سطح المكتب", width: 1280, Icon: Monitor },
  tablet: { label: "تابلت", width: 834, Icon: Tablet },
  mobile: { label: "جوال", width: 390, Icon: Smartphone },
} as const;

export type PreviewDevice = keyof typeof DEVICES;

function mockBody(pageKey: string) {
  return `
  <header data-app-header class="mock-header">
    <span class="brand">مِهلة · MEHLA</span>
    <nav><a href="#">المميزات</a><a href="#">الأسعار</a></nav>
    <button class="btn primary">ابدأ الآن</button>
  </header>
  <main>
    <section class="hero">
      <h1>إدارة القضايا والمهل بثقة</h1>
      <p>بيانات هذه المعاينة تجريبية بالكامل ولا تمثل أي عميل حقيقي.</p>
      <div class="row">
        <button class="btn primary">إنشاء قضية</button>
        <button class="btn secondary">جولة سريعة</button>
        <button class="btn danger">حذف</button>
      </div>
    </section>
    <section>
      <h2>لوحة المؤشرات</h2>
      <div class="cards">
        <div class="card"><span class="k">قضايا نشطة</span><strong>18</strong></div>
        <div class="card"><span class="k">جلسات هذا الأسبوع</span><strong>4</strong></div>
        <div class="card"><span class="k">مهل قادمة</span><strong>7</strong></div>
      </div>
    </section>
    <section>
      <h3>القضايا (بيانات تجريبية)</h3>
      <table>
        <thead><tr><th>رقم القضية</th><th>الموكل</th><th>الحالة</th></tr></thead>
        <tbody>
          <tr><td>1000000001</td><td>موكل تجريبي أ</td><td><span class="badge ok">قيد النظر</span></td></tr>
          <tr><td>1000000002</td><td>موكل تجريبي ب</td><td><span class="badge warn">بانتظار مستند</span></td></tr>
          <tr><td>1000000003</td><td>موكل تجريبي ج</td><td><span class="badge">منتهية</span></td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h3>نموذج تجريبي</h3>
      <form onsubmit="return false">
        <label>اسم الموكل<input type="text" placeholder="اكتب الاسم" /></label>
        <label>البريد<input type="email" placeholder="name@example.com" /></label>
        <label>ملاحظات<textarea rows="2" placeholder="ملاحظات"></textarea></label>
        <label class="inline"><input type="checkbox" checked /> إشعارني بالمهل</label>
        <div class="alert">تنبيه: هذه معاينة فقط ولا تُحفظ أي بيانات.</div>
        <button class="btn primary" type="button">حفظ</button>
        <button class="btn secondary" type="button">إلغاء</button>
      </form>
    </section>
  </main>
  <footer><span>مِهلة · MEHLA — معاينة تصميم · صفحة: ${pageKey}</span></footer>`;
}

const BASE_CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:var(--background,#F5F3EE);color:var(--text-primary,#1B2B26);
    font-family:var(--font-arabic,"IBM Plex Sans Arabic",system-ui,sans-serif);font-size:var(--font-size-body,15px);line-height:var(--line-height-body,1.7)}
  .mock-header{display:flex;align-items:center;gap:16px;height:var(--header-height,64px);padding:0 20px;background:var(--surface,#fff);border-bottom:1px solid var(--border,#e3e7e5)}
  .brand{font-weight:700}
  nav{display:flex;gap:14px;margin-inline-start:auto}
  nav a{color:var(--text-secondary,#5A6B66);text-decoration:none;font-size:13px}
  main{max-width:var(--content-max-width,1200px);margin:0 auto;padding:24px 20px 40px}
  section+section{margin-top:var(--section-spacing,40px)}
  h1{font-family:var(--font-headings,inherit);font-size:var(--font-size-display,40px);font-weight:var(--font-weight-heading,700);margin:0 0 8px}
  h2{font-family:var(--font-headings,inherit);font-size:var(--font-size-title,28px);font-weight:var(--font-weight-heading,700)}
  h3{font-family:var(--font-headings,inherit);font-size:var(--font-size-subtitle,20px);font-weight:var(--font-weight-heading,700)}
  .hero{background:var(--surface,#fff);border:1px solid var(--border,#e3e7e5);border-radius:var(--radius-l,12px);padding:28px;box-shadow:var(--card-shadow,none)}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
  .btn{min-height:var(--button-height,44px);border-radius:var(--button-radius,8px);padding-inline:var(--button-padding-x,20px);
    font-size:var(--button-font-size,14px);font-weight:var(--button-font-weight,600);border:1px solid transparent;cursor:pointer;box-shadow:var(--button-shadow,none);font-family:inherit}
  .btn.primary{background:var(--button-primary-bg,var(--primary,#173F35));color:var(--button-primary-fg,var(--primary-foreground,#fff))}
  .btn.primary:hover{background:var(--button-primary-hover-bg,var(--primary-hover,#12352C))}
  .btn.secondary{background:var(--button-secondary-bg,var(--surface,#fff));color:var(--button-secondary-fg,var(--text-primary,#1B2B26));border-color:var(--border,#e3e7e5);border-width:var(--button-border-width,1px)}
  .btn.danger{background:var(--button-danger-bg,var(--danger,#B3392C));color:#fff}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px}
  .card{background:var(--card-bg,var(--surface,#fff));border:1px solid var(--card-border,var(--border,#e3e7e5));border-radius:var(--card-radius,var(--radius-l,12px));padding:16px;box-shadow:var(--card-shadow,none)}
  .card .k{display:block;font-size:var(--font-size-small,13px);color:var(--text-secondary,#5A6B66)}
  .card strong{font-size:26px}
  table{width:100%;border-collapse:collapse;background:var(--surface,#fff);border:1px solid var(--border,#e3e7e5);border-radius:var(--radius-l,12px);overflow:hidden;margin-top:12px}
  thead{background:var(--table-header-bg,var(--surface-muted,#f1f1ee))}
  th,td{padding:var(--table-cell-padding,12px);text-align:start;font-size:14px;border-bottom:1px solid var(--table-row-border,var(--border,#e3e7e5))}
  tbody tr:hover{background:var(--table-row-hover,var(--surface-muted,#f7f7f5))}
  .badge{display:inline-block;border-radius:999px;padding:2px 10px;font-size:12px;background:var(--surface-muted,#f1f1ee)}
  .badge.ok{background:var(--success-soft,#EDF7F0);color:var(--success,#2F7D4F)}
  .badge.warn{background:var(--warning-soft,#FBF3E4);color:var(--warning,#B3801F)}
  form{display:grid;gap:var(--field-gap,16px);background:var(--surface,#fff);border:1px solid var(--border,#e3e7e5);border-radius:var(--radius-l,12px);padding:20px;margin-top:12px}
  label{display:grid;gap:6px;font-size:var(--font-size-small,13px);font-weight:500}
  label.inline{display:flex;align-items:center;gap:8px}
  input,textarea,select{min-height:var(--input-height,44px);border-radius:var(--input-radius,8px);background:var(--input-bg,#fff);color:var(--input-fg,var(--text-primary,#1B2B26));
    border:var(--input-border-width,1px) solid var(--input-border,var(--border,#e3e7e5));font-size:var(--input-font-size,14px);padding-inline:var(--input-padding-x,12px);font-family:inherit}
  input[type=checkbox]{min-height:0;accent-color:var(--checkbox-accent,var(--primary,#173F35))}
  input::placeholder,textarea::placeholder{color:var(--input-placeholder,var(--text-muted,#7C8A86))}
  input:focus,textarea:focus,select:focus{outline:none;border-color:var(--input-focus-border,var(--primary,#173F35))}
  .alert{background:var(--info-soft,#EDF2FB);color:var(--info,#2B5EA7);border-radius:var(--radius-m,8px);padding:10px 12px;font-size:13px}
  footer{background:var(--footer-bg,var(--primary,#173F35));color:#fff;padding:20px;font-size:13px;text-align:center}
`;

function buildDoc(pageKey: string, themeCss: string, dir: "rtl" | "ltr") {
  return `<!doctype html><html lang="ar" dir="${dir}" data-page="${pageKey}"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="/fonts/mehla-fonts.css" />
<style>${BASE_CSS}</style><style id="mehla-theme">${themeCss}</style></head>
<body>${mockBody(pageKey)}</body></html>`;
}

export function DesignPreview({
  pageKey,
  themeCss,
  direction,
}: {
  pageKey: string;
  themeCss: string;
  direction: "rtl" | "ltr";
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [zoom, setZoom] = useState(0.8);
  const [compare, setCompare] = useState(false);
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);

  const doc = useMemo(() => buildDoc(pageKey, themeCss, direction), [pageKey, themeCss, direction]);
  const baseDoc = useMemo(() => buildDoc(pageKey, "", direction), [pageKey, direction]);
  const width = DEVICES[device].width;

  // تحديث الأنماط فورياً دون إعادة تحميل الإطار (يمنع وميض التصميم)
  useEffect(() => {
    const el = frame.current?.contentDocument?.getElementById("mehla-theme");
    if (el) el.textContent = themeCss;
  }, [themeCss]);

  return (
    <div className="rounded-[var(--radius-l)] border border-border bg-surface-muted">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        {(Object.keys(DEVICES) as PreviewDevice[]).map((key) => {
          const { label, Icon } = DEVICES[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              aria-pressed={device === key}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 py-1.5 text-[12px] font-medium transition",
                device === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
        <span className="mx-1 h-5 w-px bg-border" />
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          تكبير
          <input
            type="range"
            min={0.4}
            max={1}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="تكبير المعاينة"
          />
          <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        </label>
        <button
          type="button"
          onClick={() => setCompare((v) => !v)}
          aria-pressed={compare}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 py-1.5 text-[12px] font-medium transition",
            compare
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-surface-muted",
          )}
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" aria-hidden />
          قبل / بعد
        </button>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-surface-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          إعادة تحميل
        </button>
      </div>

      <div className="overflow-auto p-4">
        <div className={cn("flex gap-4", compare ? "flex-col xl:flex-row" : "")}>
          {compare && (
            <figure className="m-0 shrink-0">
              <figcaption className="mb-1 text-[11px] font-semibold text-muted-foreground">
                قبل (التصميم الحالي)
              </figcaption>
              <iframe
                key={`base-${nonce}`}
                title="معاينة قبل التعديل"
                sandbox="allow-same-origin"
                srcDoc={baseDoc}
                style={{
                  width,
                  height: 620,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top right",
                }}
                className="rounded-[var(--radius-m)] border border-border bg-surface"
              />
            </figure>
          )}
          <figure className="m-0 shrink-0">
            {compare && (
              <figcaption className="mb-1 text-[11px] font-semibold text-primary">
                بعد (المسودة)
              </figcaption>
            )}
            <iframe
              ref={frame}
              key={`draft-${nonce}-${pageKey}-${direction}`}
              title="معاينة التصميم"
              sandbox="allow-same-origin"
              srcDoc={doc}
              style={{
                width,
                height: 620,
                transform: `scale(${zoom})`,
                transformOrigin: "top right",
              }}
              className="rounded-[var(--radius-m)] border border-border bg-surface"
            />
          </figure>
        </div>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          المعاينة تستخدم بيانات تجريبية فقط ولا تُنفّذ أي عملية حفظ أو حذف، ولا تؤثر على الموقع قبل
          النشر.
        </p>
      </div>
    </div>
  );
}
