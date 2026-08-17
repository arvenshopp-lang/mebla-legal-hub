import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const officeSlugSchema = z.object({
  slug: z.string().trim().min(1).max(100),
});

const sendOtpSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(24),
});

const verifyOtpSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  clientId: z.string().uuid(),
  phone: z.string().trim().min(6).max(24),
  code: z.string().trim().min(4).max(8),
});

const dashboardSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  sessionToken: z.string().min(10),
});

/** جلب بيانات المكتب وهوية البوابة العامة */
export const getPortalOfficeInfo = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => officeSlugSchema.parse(d))
  .handler(async ({ data }) => {
    const { getOfficeBySlugOrId } = await import("./portal-auth.server");
    const office = await getOfficeBySlugOrId(data.slug);
    if (!office) return { ok: false as const, error: "المكتب غير موجود أو غير نشط حالياً." };
    return { ok: true as const, office };
  });

/** طلب إرسال رمز التحقق لجوال الموكل عبر الرسائل النصية */
export const requestClientOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => sendOtpSchema.parse(d))
  .handler(async ({ data }) => {
    const { getOfficeBySlugOrId, sendClientPortalOtp } = await import("./portal-auth.server");
    const office = await getOfficeBySlugOrId(data.slug);
    if (!office) return { ok: false as const, error: "المكتب غير موجود أو غير نشط." };

    return await sendClientPortalOtp(office.organizationId, data.phone, office.name);
  });

/** التحقق من رمز الـ OTP وإصدار جلسة الموكل */
export const verifyClientOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => verifyOtpSchema.parse(d))
  .handler(async ({ data }) => {
    const { getOfficeBySlugOrId, verifyClientPortalOtp } = await import("./portal-auth.server");
    const office = await getOfficeBySlugOrId(data.slug);
    if (!office) return { ok: false as const, error: "المكتب غير موجود أو غير نشط." };

    return await verifyClientPortalOtp(
      office.organizationId,
      data.clientId,
      data.code,
      data.phone,
    );
  });

/** جلب لوحة معلومات وقضايا وجلسات وفواتير الموكل */
export const getClientPortalDashboard = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => dashboardSchema.parse(d))
  .handler(async ({ data }) => {
    const { loadClientPortalDashboard } = await import("./portal-auth.server");
    return await loadClientPortalDashboard(data.sessionToken, data.slug);
  });
