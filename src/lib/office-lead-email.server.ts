/**
 * بريد تنبيه المكتب بطلب جديد — يستخدم خدمة بريد المنصة القائمة فقط (بلا مرسل جديد)،
 * ومفتاح التفرّد هو معرّف الطلب فلا يتكرر البريد عند إعادة المحاولة.
 */
export async function sendOfficeLeadEmail(options: {
  to: string;
  officeName: string;
  leadName: string;
  channel: string;
  serviceKey: string;
  idempotencyKey: string;
  organizationId: string;
}): Promise<{ sent: boolean }> {
  const [{ sendAppEmail }, { OfficeLeadEmail }] = await Promise.all([
    import("@/lib/email/app-email.server"),
    import("@/lib/email-templates/office-lead"),
  ]);
  const result = await sendAppEmail({
    to: options.to,
    subject: `طلب استشارة جديد — ${options.officeName} | مِهلة`,
    element: OfficeLeadEmail({
      officeName: options.officeName,
      leadName: options.leadName,
      channel: options.channel,
      serviceKey: options.serviceKey,
    }),
    label: "office_lead_created",
    // طلب استشارة/عميل محتمل: هوية info حسب سياسة الهويات المعتمدة.
    identity: "info",
    idempotencyKey: options.idempotencyKey,
    organizationId: options.organizationId,
  });
  return { sent: result.sent };
}
