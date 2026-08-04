/**
 * عميل IMAP بروتوكولي — خادمي فقط (Hostinger: imap.hostinger.com:993 TLS ضمني).
 *
 * يدعم ما تحتاجه المزامنة التزايدية فقط: SELECT/EXAMINE، UID FETCH بمدى،
 * UID STORE للأعلام، UID MOVE، وLIST للمجلدات. لا يُخزَّن أي سر، ولا تُسجَّل
 * سطور المصادقة، والأخطاء تُصنَّف قبل الإرجاع.
 */
import { connectMailSocket, type MailSocket } from "./socket.server";
import { redactTransportError, transportConfig } from "./config.server";

export type ImapErrorCode =
  | "imap_not_configured"
  | "imap_connect_failed"
  | "imap_auth_failed"
  | "imap_select_failed"
  | "imap_protocol_error"
  | "imap_timeout";

export class ImapError extends Error {
  readonly code: ImapErrorCode;
  constructor(code: ImapErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ImapError";
  }
}

export type MailboxStatus = {
  folder: string;
  uidValidity: number;
  uidNext: number;
  exists: number;
};

export type FetchedMessage = {
  uid: number;
  flags: string[];
  internalDate: string | null;
  raw: Uint8Array;
};

type CommandResult = { lines: string[]; literals: Map<number, Uint8Array> };

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, (m) => `\\${m}`)}"`;
}

export class ImapConnection {
  private socket: MailSocket;
  private counter = 0;
  private mailboxAddress: string | null;

  private constructor(socket: MailSocket, mailboxAddress: string | null) {
    this.socket = socket;
    this.mailboxAddress = mailboxAddress;
  }

  static async open(mailboxAddress?: string | null): Promise<ImapConnection> {
    const config = transportConfig(mailboxAddress ?? null);
    if (!config.user || !config.password) {
      throw new ImapError("imap_not_configured", "بيانات IMAP غير مكتملة في الأسرار.");
    }
    let socket: MailSocket;
    try {
      socket = await connectMailSocket({
        host: config.imap.host,
        port: config.imap.port,
        tls: config.imap.secure,
        timeoutMs: 25_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ImapError(
        message.includes("timeout") ? "imap_timeout" : "imap_connect_failed",
        redactTransportError(message, mailboxAddress ?? null),
      );
    }
    const connection = new ImapConnection(socket, mailboxAddress ?? null);
    const greeting = await socket.readLine();
    if (!/^\*\s+(OK|PREAUTH)/i.test(greeting)) {
      await connection.close();
      throw new ImapError("imap_protocol_error", "ترحيب IMAP غير متوقع.");
    }
    try {
      await connection.run(`LOGIN ${quote(config.user)} ${quote(config.password)}`, {
        redactCommand: true,
      });
    } catch (error) {
      await connection.close();
      if (error instanceof ImapError) {
        throw new ImapError("imap_auth_failed", "فشلت مصادقة IMAP — تحقق من بيانات الصندوق.");
      }
      throw error;
    }
    return connection;
  }

  /** ينفّذ أمراً موسوماً ويجمع أسطر الاستجابة وكل literal بحسب موضعه. */
  async run(command: string, options: { redactCommand?: boolean } = {}): Promise<CommandResult> {
    this.counter += 1;
    const tag = `A${String(this.counter).padStart(4, "0")}`;
    await this.socket.write(`${tag} ${command}\r\n`);
    const lines: string[] = [];
    const literals = new Map<number, Uint8Array>();

    for (;;) {
      let line = await this.socket.readLine();
      // literal بصيغة {n} في نهاية السطر: يُقرأ خاماً ثم يُتبع ببقية السطر.
      for (;;) {
        const match = /\{(\d+)\}$/.exec(line);
        if (!match) break;
        const size = Number(match[1]);
        const bytes = await this.socket.readExact(size);
        literals.set(lines.length, bytes);
        const rest = await this.socket.readLine();
        line = `${line.slice(0, match.index)}<literal:${size}>${rest}`;
      }
      lines.push(line);
      if (line.startsWith(`${tag} `)) {
        if (/^\S+\s+OK/i.test(line)) return { lines, literals };
        const detail = options.redactCommand
          ? "رفض الخادم الأمر."
          : redactTransportError(line, this.mailboxAddress);
        throw new ImapError("imap_protocol_error", detail);
      }
      if (lines.length > 20_000) throw new ImapError("imap_protocol_error", "استجابة IMAP طويلة جداً.");
    }
  }

  /** قائمة المجلدات المتاحة فعلياً على الخادم. */
  async listFolders(): Promise<string[]> {
    const { lines } = await this.run('LIST "" "*"');
    const folders: string[] = [];
    for (const line of lines) {
      if (!line.startsWith("* LIST")) continue;
      const quoted = /"([^"]+)"\s*$/.exec(line);
      const bare = /\s(\S+)\s*$/.exec(line);
      const name = quoted?.[1] ?? bare?.[1];
      if (name && name !== "NIL") folders.push(name);
    }
    return folders;
  }

  async select(folder: string, readOnly = false): Promise<MailboxStatus> {
    let result: CommandResult;
    try {
      result = await this.run(`${readOnly ? "EXAMINE" : "SELECT"} ${quote(folder)}`);
    } catch {
      throw new ImapError("imap_select_failed", `تعذّر فتح المجلد ${folder}.`);
    }
    const joined = result.lines.join("\n");
    const uidValidity = Number(/UIDVALIDITY\s+(\d+)/i.exec(joined)?.[1] ?? 0);
    const uidNext = Number(/UIDNEXT\s+(\d+)/i.exec(joined)?.[1] ?? 0);
    const exists = Number(/\*\s+(\d+)\s+EXISTS/i.exec(joined)?.[1] ?? 0);
    return { folder, uidValidity, uidNext, exists };
  }

  /** يسحب الرسائل التي معرّفها أكبر من `afterUid` بحد أقصى محدد. */
  async fetchSince(afterUid: number, limit: number): Promise<FetchedMessage[]> {
    const start = Math.max(afterUid + 1, 1);
    const { lines, literals } = await this.run(
      `UID FETCH ${start}:* (UID FLAGS INTERNALDATE BODY.PEEK[])`,
    );
    const messages: FetchedMessage[] = [];
    lines.forEach((line, index) => {
      if (!/^\*\s+\d+\s+FETCH/i.test(line)) return;
      const uid = Number(/UID\s+(\d+)/i.exec(line)?.[1] ?? 0);
      const raw = literals.get(index);
      if (!uid || !raw) return;
      const flags = (/FLAGS\s+\(([^)]*)\)/i.exec(line)?.[1] ?? "")
        .split(/\s+/)
        .filter(Boolean);
      const internal = /INTERNALDATE\s+"([^"]+)"/i.exec(line)?.[1] ?? null;
      messages.push({ uid, flags, internalDate: internal, raw });
    });
    return messages.sort((a, b) => a.uid - b.uid).slice(0, limit);
  }

  async setFlag(uid: number, flag: string, add: boolean): Promise<void> {
    await this.run(`UID STORE ${uid} ${add ? "+" : "-"}FLAGS (${flag})`);
  }

  /** ينقل رسالة إلى مجلد آخر (MOVE إن توفر، وإلا COPY ثم حذف). */
  async moveMessage(uid: number, destination: string): Promise<void> {
    try {
      await this.run(`UID MOVE ${uid} ${quote(destination)}`);
    } catch {
      await this.run(`UID COPY ${uid} ${quote(destination)}`);
      await this.run(`UID STORE ${uid} +FLAGS (\\Deleted)`);
      await this.run("EXPUNGE");
    }
  }

  async close(): Promise<void> {
    try {
      await this.socket.write("A999 LOGOUT\r\n");
    } catch {
      /* المقبس مغلق */
    }
    await this.socket.close();
  }
}

/** اختبار اتصال ومصادقة IMAP دون أي تعديل على الصندوق. */
export async function imapVerify(
  mailboxAddress?: string | null,
): Promise<
  | { ok: true; latencyMs: number; folders: string[]; inbox: MailboxStatus }
  | { ok: false; code: ImapErrorCode; message: string; latencyMs: number }
> {
  const started = Date.now();
  let connection: ImapConnection | null = null;
  try {
    connection = await ImapConnection.open(mailboxAddress ?? null);
    const folders = await connection.listFolders();
    const inbox = await connection.select("INBOX", true);
    return { ok: true, latencyMs: Date.now() - started, folders, inbox };
  } catch (error) {
    const imapError =
      error instanceof ImapError
        ? error
        : new ImapError(
            "imap_connect_failed",
            redactTransportError(error instanceof Error ? error.message : String(error), mailboxAddress ?? null),
          );
    return {
      ok: false,
      code: imapError.code,
      message: imapError.message,
      latencyMs: Date.now() - started,
    };
  } finally {
    if (connection) await connection.close().catch(() => undefined);
  }
}