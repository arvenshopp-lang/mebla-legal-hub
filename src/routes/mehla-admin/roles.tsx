/**
 * توحيد معماري: إدارة الأدوار والصلاحيات أصبحت داخل مركز RBAC.
 * يبقى هذا المسار للحفاظ على الروابط القديمة ويحوّل فوراً إلى /mehla-admin/rbac.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { NOINDEX_META } from "@/config/indexing";

export const Route = createFileRoute("/mehla-admin/roles")({
  head: () => ({
    meta: [{ title: "الأدوار والصلاحيات | إدارة مِهلة" }, NOINDEX_META],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/mehla-admin/rbac", replace: true });
  },
});
