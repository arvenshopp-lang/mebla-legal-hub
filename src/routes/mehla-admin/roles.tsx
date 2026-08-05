/**
 * توحيد معماري: إدارة الأدوار والصلاحيات أصبحت داخل مركز RBAC.
 * يبقى هذا المسار للحفاظ على الروابط القديمة ويحوّل فوراً إلى /mehla-admin/rbac.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/mehla-admin/roles")({
  beforeLoad: () => {
    throw redirect({ to: "/mehla-admin/rbac", replace: true });
  },
});
