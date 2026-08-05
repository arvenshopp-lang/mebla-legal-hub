/**
 * مؤشرات المسودة داخل النماذج: حالة الحفظ التلقائي، وسؤال استكمال المسودة.
 */
import { CheckCircle2, Loader2, RotateCcw, TriangleAlert } from "lucide-react";
import type { AutoSaveDraft } from "./use-autosave-draft";

function relativeTime(timestamp: number): string {
  const seconds = Math.max(1, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "قبل لحظات";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${Math.round(hours / 24)} يوم`;
}

export function DraftStatus({ draft }: { draft: AutoSaveDraft<Record<string, unknown>> }) {
  if (draft.status === "saving") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[12px] text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        جاري الحفظ التلقائي…
      </p>
    );
  }
  if (draft.status === "saved") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[12px] text-success">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        تم الحفظ تلقائياً
      </p>
    );
  }
  if (draft.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-[12px] text-danger">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        تعذّر الحفظ التلقائي، بياناتك لا تزال موجودة في النموذج.
        <button
          type="button"
          onClick={draft.retry}
          className="rounded-[var(--radius-s)] border border-danger/30 px-2 py-0.5 font-medium text-danger hover:bg-danger-soft"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }
  return null;
}

export function DraftPrompt({ draft }: { draft: AutoSaveDraft<Record<string, unknown>> }) {
  if (!draft.prompt) return null;
  return (
    <div
      role="status"
      className="mb-4 rounded-[var(--radius-m)] border border-warning/30 bg-warning-soft p-3.5 text-[12.5px] leading-6 text-foreground"
    >
      <p className="font-medium">
        وجدنا مسودة غير مكتملة {relativeTime(draft.prompt.savedAt)} — هل ترغب في استكمالها أو حذفها؟
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={draft.restore}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[var(--radius-m)] bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition hover:bg-primary-hover"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          استكمال المسودة
        </button>
        <button
          type="button"
          onClick={draft.discard}
          className="min-h-[36px] rounded-[var(--radius-m)] border border-border bg-surface px-3.5 text-[12.5px] font-medium text-foreground transition hover:bg-surface-muted"
        >
          حذف المسودة
        </button>
      </div>
    </div>
  );
}
