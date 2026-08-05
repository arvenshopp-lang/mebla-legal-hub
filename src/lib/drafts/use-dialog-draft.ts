/**
 * الحفظ التلقائي لنماذج النوافذ (العملاء، القضايا، الجلسات، المهل، المهام).
 *
 * يعمل فقط على السجلات الجديدة وأثناء فتح النافذة، ولا يحفظ أي حقل حسّاس
 * (أرقام الهوية والسجل التجاري تبقى في الخادم فقط).
 */
import { useCallback, useMemo } from "react";
import { useAutoSaveDraft, type AutoSaveDraft } from "./use-autosave-draft";

const SENSITIVE_FIELDS = ["national_id", "commercial_registration", "password", "code"] as const;

export function useDialogDraft<T extends Record<string, unknown>>({
  name,
  open,
  isNew,
  userKey,
  form,
  setForm,
  omit = [],
}: {
  name: string;
  open: boolean;
  isNew: boolean;
  userKey: string;
  form: Partial<T>;
  setForm: (updater: (prev: Partial<T>) => Partial<T>) => void;
  omit?: readonly string[];
}): AutoSaveDraft<Partial<T>> {
  const onRestore = useCallback(
    (value: Partial<T>) => setForm((prev) => ({ ...prev, ...value })),
    [setForm],
  );
  const omitFields = useMemo(() => [...SENSITIVE_FIELDS, ...omit], [omit]);
  return useAutoSaveDraft<Partial<T>>({
    scope: `${name}:new`,
    userKey,
    value: form,
    enabled: open && isNew,
    omit: omitFields,
    onRestore,
  });
}
