/**
 * معاينة التصميم — تعرض صفحة المنصة الحقيقية داخل إطار من نفس الأصل
 * وتحقن CSS المسودة فيها عبر جسر رسائل مقيّد بالأصل.
 *
 * ليست بيانات وهمية ولا HTML مصنوع: نفس المسار، نفس المكوّنات، نفس styles.css،
 * ونفس data-page المستخدم في عزل CSS — لذلك ما تراه هنا هو ما سيُنشر.
 * الصفحة تُعرض بجلسة المستخدم وصلاحياته، وأي صفحة محمية تُرفض كما تُرفض عادة.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  SplitSquareHorizontal,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultPreviewDevice, designPage, previewPathFor } from "@/lib/design/pages";
import { designPreviewUrl, onPreviewReady, postDraftCss } from "@/lib/design/preview-bridge";
import { harvestSelectors, type HarvestedSelector } from "@/lib/design/selectors";

const DEVICES = {
  desktop: { label: "سطح المكتب", width: 1280, Icon: Monitor },
  tablet: { label: "تابلت", width: 834, Icon: Tablet },
  mobile: { label: "جوال", width: 390, Icon: Smartphone },
} as const;

export type PreviewDevice = keyof typeof DEVICES;

const FRAME_HEIGHT = 680;

export function DesignPreview({
  pageKey,
  themeCss,
  onSelectors,
}: {
  pageKey: string;
  themeCss: string;
  /** خريطة العناصر الحقيقية المستخرجة من الصفحة — تُستخدم في لوح المرجع */
  onSelectors?: (selectors: HarvestedSelector[]) => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>(() => defaultPreviewDevice(pageKey));
  const [zoom, setZoom] = useState(0.8);
  const [compare, setCompare] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [ready, setReady] = useState(false);
  const draftFrame = useRef<HTMLIFrameElement>(null);

  const page = designPage(pageKey);
  const path = previewPathFor(pageKey);
  const isFallbackSurface = !page?.previewPath;
  const src = useMemo(() => designPreviewUrl(path), [path]);
  const width = DEVICES[device].width;

  useEffect(() => {
    setDevice(defaultPreviewDevice(pageKey));
    setReady(false);
  }, [pageKey]);

  // جهوزية الإطار: أول رسالة تعني أن الجسر ثبّت عنصر الأنماط
  useEffect(() => {
    return onPreviewReady(() => setReady(true));
  }, []);

  const publish = useCallback(() => {
    postDraftCss(draftFrame.current, themeCss);
  }, [themeCss]);

  // بثّ المسودة عند كل تغيير وعند جهوزية الإطار — بلا إعادة تحميل ولا وميض
  useEffect(() => {
    if (!ready) return;
    publish();
  }, [ready, publish]);

  const collect = useCallback(() => {
    const doc = draftFrame.current?.contentDocument;
    if (!doc || !onSelectors) return;
    try {
      onSelectors(harvestSelectors(doc));
    } catch {
      /* الإطار لم يكتمل تحميله بعد */
    }
  }, [onSelectors]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(collect, 600);
    return () => clearTimeout(timer);
  }, [ready, collect, nonce, pageKey]);

  const frameStyle = {
    width,
    height: FRAME_HEIGHT,
    transform: `scale(${zoom})`,
    transformOrigin: "top right",
  } as const;

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
                "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 text-[12px] font-medium transition",
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
            "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 text-[12px] font-medium transition",
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
          onClick={() => {
            setReady(false);
            setNonce((n) => n + 1);
          }}
          className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-surface-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          إعادة تحميل
        </button>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-s)] px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-surface-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          فتح المسار
        </a>
      </div>

      <div className="overflow-auto p-4">
        <p className="mb-3 text-[11.5px] text-muted-foreground">
          المسار المعروض:{" "}
          <code className="font-mono" dir="ltr">
            {path}
          </code>
          {isFallbackSurface &&
            " — هذا النطاق لا يملك صفحة مستقلة، فتُعرض عليه صفحة حقيقية تحتوي عناصره."}
          {!ready && " · جارٍ تحميل الصفحة الحقيقية…"}
        </p>

        <div className={cn("flex gap-4", compare ? "flex-col xl:flex-row" : "")}>
          {compare && (
            <figure className="m-0 shrink-0">
              <figcaption className="mb-1 text-[11px] font-semibold text-muted-foreground">
                قبل (التصميم المنشور حالياً)
              </figcaption>
              <iframe
                key={`base-${nonce}-${pageKey}`}
                title="معاينة التصميم المنشور"
                src={src}
                style={frameStyle}
                className="rounded-[var(--radius-m)] border border-border bg-surface"
              />
            </figure>
          )}
          <figure className="m-0 shrink-0">
            {compare && (
              <figcaption className="mb-1 text-[11px] font-semibold text-primary">
                بعد (المسودة الحالية)
              </figcaption>
            )}
            <iframe
              ref={draftFrame}
              key={`draft-${nonce}-${pageKey}`}
              title="معاينة مسودة التصميم"
              src={src}
              style={frameStyle}
              onLoad={() => publish()}
              className="rounded-[var(--radius-m)] border border-border bg-surface"
            />
          </figure>
        </div>

        <p className="mt-3 text-[11.5px] text-muted-foreground">
          المعاينة تعمل على الصفحة الحقيقية بجلستك وصلاحياتك، وCSS المسودة يُحقن مؤقتاً في هذا
          الإطار فقط ولا يمسّ الموقع قبل النشر.
        </p>
      </div>
    </div>
  );
}
