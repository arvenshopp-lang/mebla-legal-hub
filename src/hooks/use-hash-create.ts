import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * يفتح نموذج الإنشاء القائم في الصفحة عند الوصول إليها بالهاش #new
 * (المستخدم من زر «إنشاء» في الشريط العلوي)، ثم ينظّف الهاش.
 * لا يفتح شيئاً إذا لم يكن المستخدم مصرّحاً بالإنشاء.
 */
export function useHashCreate(enabled: boolean, openForm: () => void) {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const navigate = useNavigate();

  useEffect(() => {
    if (hash !== "new") return;
    navigate({ to: ".", hash: "", replace: true } as never);
    if (enabled) openForm();
    // openForm مستقر داخل الصفحات (setState)، ونعتمد على تغيّر الهاش فقط.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, enabled]);
}