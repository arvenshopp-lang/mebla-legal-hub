/**
 * عميل SMTP بروتوكولي — خادمي فقط (Hostinger: smtp.hostinger.com:465 TLS ضمني).
 *
 * لا يفتح المقبس إلا من الخادم، والاتصال مُشفّر مع تحقق شهادة، وكلمة المرور لا
 * تُسجَّل ولا تُعاد. أي فشل يُرجَع كرمز مُصنَّف لا كنص خام من المزوّد.
 */
import { connectMailSocket, type MailSocket } from "./socket.server";
import { buildMimeMessage, type OutgoingMessage } from "./mime.server";
import {
  redactTransportError,
  senderIdentity,
  transportConfig,
  type MailTransportConfig,
} from "./config.server";

export type SmtpResult =
  | {
      ok: true;
      response: string;
      latencyMs: number;
      smtpCode: number;
      envelopeFrom?: string;
      headerFrom?: string;
      replyTo?: string | null;
    }
  | {
      ok: false;
      code: SmtpErrorCode;
      message: string;
      latencyMs: number;
      smtpCode?: number;
      envelopeFrom?: string;
      headerFrom?: string;
    };

export type SmtpErrorCode =
  | "smtp_not_configured"
  | "smtp_connect_failed"
  | "smtp_auth_failed"
  | "smtp_rejected_sender"
  | "smtp_rejected_recipient"
  | "smtp_rejected_data"
  | "smtp_protocol_error"
  | "smtp_timeout";

type Reply = { code: number; text: string };

async function readReply(socket: MailSocket): Promise<Reply> {
  const lines: string[] = [];
  for (;;) {
    const line = await socket.readLine();
    lines.push(line);
    // آخر سطر في الرد لا يحمل شرطة بعد الرقم.
    if (/^\d{3} /.test(line) || line.length < 4) break;
  }
  const last = lines[lines.length - 1] ?? "";
  const code = Number(last.slice(0, 3));
  return { code: Number.isFinite(code) ? code : 0, text: lines.join(" | ").slice(0, 300) };
}

async function command(socket: MailSocket, line: string): Promise<Reply> {
  await socket.write(`${line}\r\n`);
  return readReply(socket);
}

function classify(error: unknown): { code: SmtpErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("mail_socket_timeout")) return { code: "smtp_timeout", message };
  return { code: "smtp_connect_failed", message };
}

/** يفتح جلسة SMTP مُصادَقة ويعيدها للاستخدام ثم الإغلاق. */
async function openSession(
  config: MailTransportConfig,
  mailboxAddress: string | null,
): Promise<{ socket: MailSocket; banner: string }> {
  const socket = await connectMailSocket({
    host: config.smtp.host,
    port: config.smtp.port,
    tls: config.smtp.secure,
    timeoutMs: 20_000,
  });
  const banner = await readReply(socket);
  if (banner.code !== 220) {
    await socket.close();
    throw new Error(`smtp_protocol_error:${redactTransportError(banner.text, mailboxAddress)}`);
  }
  const ehlo = await command(socket, `EHLO mehlalex.com`);
  if (ehlo.code !== 250) {
    await socket.close();
    throw new Error(`smtp_protocol_error:${redactTransportError(ehlo.text, mailboxAddress)}`);
  }
  const auth = await command(socket, "AUTH LOGIN");
  if (auth.code !== 334) {
    await socket.close();
    throw new Error("smtp_auth_failed");
  }
  const userReply = await command(socket, btoa(config.user));
  if (userReply.code !== 334) {
    await socket.close();
    throw new Error("smtp_auth_failed");
  }
  const passReply = await command(socket, btoa(config.password));
  if (passReply.code !== 235) {
    await socket.close();
    throw new Error("smtp_auth_failed");
  }
  return { socket, banner: banner.text };
}

/** اختبار اتصال ومصادقة فقط — لا يُرسل أي رسالة. */
export async function smtpVerify(mailboxAddress?: string | null): Promise<SmtpResult> {
  const started = Date.now();
  const config = transportConfig(mailboxAddress ?? null);
  if (!config.user || !config.password) {
    return {
      ok: false,
      code: "smtp_not_configured",
      message: "بيانات SMTP غير مكتملة في الأسرار.",
      latencyMs: 0,
    };
  }
  try {
    const { socket } = await openSession(config, mailboxAddress ?? null);
    await command(socket, "QUIT");
    await socket.close();
    return {
      ok: true,
      response: "مصادقة SMTP ناجحة.",
      smtpCode: 235,
      latencyMs: Date.now() - started,
      envelopeFrom: senderIdentity(mailboxAddress ?? null).envelopeFrom,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("smtp_auth_failed")) {
      return {
        ok: false,
        code: "smtp_auth_failed",
        message: "فشلت مصادقة SMTP — تحقق من بيانات الصندوق في الأسرار.",
        latencyMs: Date.now() - started,
      };
    }
    if (message.startsWith("smtp_protocol_error")) {
      return {
        ok: false,
        code: "smtp_protocol_error",
        message: "استجابة SMTP غير متوقعة من الخادم.",
        latencyMs: Date.now() - started,
      };
    }
    const classified = classify(error);
    return {
      ok: false,
      code: classified.code,
      message: redactTransportError(classified.message, mailboxAddress ?? null),
      latencyMs: Date.now() - started,
    };
  }
}

/** إرسال رسالة واحدة. قبول SMTP = «قُبلت للتسليم» فقط، وليس تسليماً نهائياً. */
export async function smtpSend(
  message: OutgoingMessage,
  mailboxAddress?: string | null,
): Promise<SmtpResult> {
  const started = Date.now();
  const config = transportConfig(mailboxAddress ?? message.from);
  const identity = senderIdentity(mailboxAddress ?? message.from);
  if (!config.user || !config.password) {
    return {
      ok: false,
      code: "smtp_not_configured",
      message: "بيانات SMTP غير مكتملة في الأسرار.",
      latencyMs: 0,
    };
  }
  const recipients = [...message.to, ...message.cc, ...message.bcc].filter(Boolean);
  if (recipients.length === 0) {
    return {
      ok: false,
      code: "smtp_rejected_recipient",
      message: "لا يوجد مستلم صالح.",
      latencyMs: 0,
    };
  }

  let socket: MailSocket | null = null;
  try {
    const session = await openSession(config, mailboxAddress ?? null);
    socket = session.socket;

    // المظروف بالحساب المُصادق عليه؛ ترويسة From تبقى بالاسم المستعار.
    const envelopeFrom = identity.envelopeFrom || message.from;
    const mailFrom = await command(socket, `MAIL FROM:<${envelopeFrom}>`);
    if (mailFrom.code !== 250) {
      await command(socket, "QUIT");
      return {
        ok: false,
        code: "smtp_rejected_sender",
        message: "رفض الخادم عنوان المُرسل.",
        latencyMs: Date.now() - started,
        smtpCode: mailFrom.code,
        envelopeFrom,
        headerFrom: message.from,
      };
    }
    for (const recipient of recipients) {
      const rcpt = await command(socket, `RCPT TO:<${recipient}>`);
      if (rcpt.code !== 250 && rcpt.code !== 251) {
        await command(socket, "QUIT");
        return {
          ok: false,
          code: "smtp_rejected_recipient",
          message: "رفض الخادم أحد المستلمين.",
          latencyMs: Date.now() - started,
        };
      }
    }

    const dataReply = await command(socket, "DATA");
    if (dataReply.code !== 354) {
      await command(socket, "QUIT");
      return {
        ok: false,
        code: "smtp_protocol_error",
        message: "رفض الخادم بدء نقل المحتوى.",
        latencyMs: Date.now() - started,
      };
    }

    const body = buildMimeMessage(message)
      .split("\r\n")
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");
    await socket.write(`${body}\r\n.\r\n`);
    const accepted = await readReply(socket);
    await command(socket, "QUIT");
    await socket.close();
    socket = null;

    if (accepted.code !== 250) {
      return {
        ok: false,
        code: "smtp_rejected_data",
        message: "لم يقبل الخادم محتوى الرسالة.",
        latencyMs: Date.now() - started,
        smtpCode: accepted.code,
        envelopeFrom,
        headerFrom: message.from,
      };
    }
    return {
      ok: true,
      response: accepted.text.slice(0, 200),
      latencyMs: Date.now() - started,
      smtpCode: accepted.code,
      envelopeFrom,
      headerFrom: message.from,
      replyTo: message.replyTo ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (socket) {
      try {
        await socket.close();
      } catch {
        /* المقبس مغلق */
      }
    }
    if (message.startsWith("smtp_auth_failed")) {
      return {
        ok: false,
        code: "smtp_auth_failed",
        message: "فشلت مصادقة SMTP.",
        latencyMs: Date.now() - started,
      };
    }
    const classified = classify(error);
    return {
      ok: false,
      code: classified.code,
      message: redactTransportError(classified.message, mailboxAddress ?? null),
      latencyMs: Date.now() - started,
    };
  }
}
