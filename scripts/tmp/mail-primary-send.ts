const { smtpSend } = await import("@/lib/email/transport/smtp.server");
const { senderIdentity, primaryMailboxAddress } = await import("@/lib/email/transport/config.server");
const primary = primaryMailboxAddress();
const id = senderIdentity(primary);
const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const messageId = `<${crypto.randomUUID()}@mehlalex.com>`;
const r = await smtpSend({
  from: id.headerFrom, fromName: "منصة مِهلة", to: ["ziad.emb@gmail.com"], cc: [], bcc: [],
  replyTo: id.replyTo, subject: `MEHLA EMAIL E2E — PRIMARY — ${stamp}`,
  html: "<p>اختبار نقل حقيقي من حساب النقل الرئيسي (هوية النظام).</p>",
  text: "اختبار نقل حقيقي من حساب النقل الرئيسي (هوية النظام).",
  messageId, autoSubmitted: true,
}, primary);
console.log(JSON.stringify({ identity: primary, isSystem: id.isSystem, replyTo: id.replyTo, messageId, result: r }));
