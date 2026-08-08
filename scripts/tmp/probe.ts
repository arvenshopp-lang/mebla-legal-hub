const c = await import("@/lib/email/transport/config.server");
console.log("primary:", c.primaryMailboxAddress() || "(missing)");
console.log("secrets:", JSON.stringify(c.secretsStatus(null)));
console.log("identity support:", JSON.stringify(c.senderIdentity("support@mehlalex.com")));
console.log("identity noreply:", JSON.stringify(c.senderIdentity("noreply@mehlalex.com")));
const s = await import("@/lib/email/transport/smtp.server");
console.log("smtpVerify:", JSON.stringify(await s.smtpVerify("support@mehlalex.com")));
