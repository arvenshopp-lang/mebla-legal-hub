/**
 * الحفظ التلقائي للنماذج (Auto Save Draft).
 *
 * • يحفظ الحقول مشفّرة كل ثانية تقريباً أثناء الكتابة، وفوراً عند مغادرة الصفحة.
 * • الرجوع من تطبيق آخر داخل نفس جلسة التبويب يستعيد البيانات تلقائياً وبصمت.
 * • فتح المتصفح من جديد يعرض سؤالاً: استكمال المسودة أو حذفها.
 * • كلمات المرور ورموز التحقق تُستبعد نهائياً عبر `omit`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageLifecycle } from "@/hooks/use-page-lifecycle";
import {
  clearDraft,
  draftSessionId,
  isMeaningfulDraft,
  loadDraft,
  redactDraft,
  saveDraft,
} from "./draft-store";

export type DraftStatus = "idle" | "saving" | "saved" | "error" | "unavailable";

export type UseAutoSaveDraftOptions<T extends Record<string, unknown>> = {
  /** معرّف فريد للنموذج والسجل، مثل `clients:new` أو `cases:<id>` */
  scope: string;
  /** معرّف المستخدم أو "anon" — يمنع تسرّب مسودة بين حسابين على نفس الجهاز. */
  userKey: string;
  value: T;
  /** يتوقف الحفظ عندما يكون النموذج مغلقاً. */
  enabled?: boolean;
  /** حقول يُمنع حفظها (كلمة المرور، رمز التحقق…). */
  omit?: readonly string[];
  /** يُطبّق المسودة على حالة النموذج. */
  onRestore: (value: Partial<T>) => void;
  debounceMs?: number;
};

export type AutoSaveDraft<T> = {
  status: DraftStatus;
  savedAt: number | null;
  /** مسودة من جلسة سابقة تنتظر قرار المستخدم. */
  prompt: { savedAt: number } | null;
  restore: () => void;
  discard: () => void;
  /** يُنادى بعد نجاح الحفظ النهائي لحذف المسودة. */
  clear: () => void;
  retry: () => void;
  lastValue: Partial<T> | null;
};

export function useAutoSaveDraft<T extends Record<string, unknown>>({
  scope,
  userKey,
  value,
  enabled = true,
  omit = [],
  onRestore,
  debounceMs = 1000,
}: UseAutoSaveDraftOptions<T>): AutoSaveDraft<T> {
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [prompt, setPrompt] = useState<{ savedAt: number } | null>(null);
  const pendingValue = useRef<Partial<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;
  const suppressSave = useRef(true);
  const dirty = useRef(false);
  const [pendingDraft, setPendingDraft] = useState<Partial<T> | null>(null);

  const flush = useCallback(async () => {
    const snapshot = pendingValue.current;
    if (!snapshot || !isMeaningfulDraft(snapshot)) return;
    setStatus("saving");
    const ok = await saveDraft(userKey, scope, snapshot);
    if (ok) {
      setSavedAt(Date.now());
      setStatus("saved");
    } else {
      setStatus("error");
    }
  }, [scope, userKey]);

  // استعادة المسودة عند تشغيل النموذج
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    suppressSave.current = true;
    dirty.current = false;
    setPrompt(null);
    setPendingDraft(null);
    setStatus("idle");
    setSavedAt(null);
    void (async () => {
      const envelope = await loadDraft<Partial<T>>(userKey, scope);
      if (!active) {
        return;
      }
      if (envelope && isMeaningfulDraft(envelope.value)) {
        if (envelope.sessionId === draftSessionId()) {
          // نفس جلسة التبويب: رجوع من تطبيق آخر أو تنقّل داخلي — استعادة صامتة.
          restoreRef.current(envelope.value);
          setSavedAt(envelope.savedAt);
          setStatus("saved");
        } else {
          setPendingDraft(envelope.value);
          setPrompt({ savedAt: envelope.savedAt });
        }
      }
      // نسمح بالحفظ بعد أول دورة تصيير حتى لا تُحفظ قيم فارغة فوراً
      suppressSave.current = false;
    })();
    return () => {
      active = false;
    };
  }, [enabled, scope, userKey]);

  // حفظ مؤجّل أثناء الكتابة
  useEffect(() => {
    if (!enabled) return;
    const snapshot = redactDraft(value, omit);
    pendingValue.current = snapshot;
    if (suppressSave.current) return;
    if (!isMeaningfulDraft(snapshot)) return;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled, debounceMs, flush]);

  // مغادرة الصفحة (تبديل تطبيق / قفل شاشة / إخفاء تبويب) → حفظ فوري
  usePageLifecycle({
    onHide: () => {
      if (!enabled || suppressSave.current || !dirty.current) return;
      if (timer.current) clearTimeout(timer.current);
      void flush();
    },
  });

  const restore = useCallback(() => {
    if (pendingDraft) restoreRef.current(pendingDraft);
    setPrompt(null);
    setPendingDraft(null);
    setStatus("saved");
  }, [pendingDraft]);

  const discard = useCallback(() => {
    clearDraft(userKey, scope);
    setPrompt(null);
    setPendingDraft(null);
    setSavedAt(null);
    setStatus("idle");
  }, [scope, userKey]);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    suppressSave.current = true;
    dirty.current = false;
    pendingValue.current = null;
    clearDraft(userKey, scope);
    setPrompt(null);
    setPendingDraft(null);
    setSavedAt(null);
    setStatus("idle");
  }, [scope, userKey]);

  const retry = useCallback(() => {
    void flush();
  }, [flush]);

  return {
    status,
    savedAt,
    prompt,
    restore,
    discard,
    clear,
    retry,
    lastValue: pendingValue.current,
  };
}
