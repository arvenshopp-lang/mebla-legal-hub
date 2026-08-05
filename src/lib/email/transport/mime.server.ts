/**
 * بناء وتحليل رسائل MIME — خادمي فقط.
 *
 * البناء: رسالة متعددة الأجزاء (نص + HTML + مرفقات) بترميز Base64 لضمان سلامة
 * المحتوى العربي، ورؤوس RFC 2047 للعناوين والموضوع.
 * التحليل: قراءة الرسالة الخام من IMAP واستخراج الرؤوس والنص والمرفقات، دون أي
 * ثقة بما يعلنه المُرسل (النوع الفعلي يُتحقق لاحقاً في طبقة المرفقات).
 */

const CRLF = "\r\n";

export type OutgoingAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type OutgoingMessage = {
  from: string;
  fromName: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  date?: Date;
  attachments?: OutgoingAttachment[];
};

export function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function base64Decode(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, "");
  const binary = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function wrap(value: string, width = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += width) lines.push(value.slice(i, i + width));
  return lines.join(CRLF);
}

/** ترميز رأس يحتمل محتوى غير ASCII (RFC 2047). */
export function encodeHeaderValue(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();

  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${base64Encode(new TextEncoder().encode(clean))}?=`;
}

function addressHeader(address: string, name?: string | null): string {
  const safeAddress = address.replace(/[\r\n<>,;]/g, "").trim();
  if (!name?.trim()) return safeAddress;
  return `${encodeHeaderValue(name)} <${safeAddress}>`;
}

function addressList(addresses: string[]): string {
  return addresses
    .map((a) => a.replace(/[\r\n<>,;]/g, "").trim())
    .filter(Boolean)
    .join(", ");
}

function boundary(prefix: string): string {
  return `----=_mehla_${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** يبني الرسالة الكاملة الجاهزة لأمر DATA (بدون dot-stuffing). */
export function buildMimeMessage(message: OutgoingMessage): string {
  const attachments = message.attachments ?? [];
  const altBoundary = boundary("alt");
  const mixedBoundary = boundary("mix");
  const date = (message.date ?? new Date()).toUTCString().replace("GMT", "+0000");

  const headers: string[] = [
    `Date: ${date}`,
    `From: ${addressHeader(message.from, message.fromName)}`,
    `To: ${addressList(message.to)}`,
  ];
  if (message.cc.length > 0) headers.push(`Cc: ${addressList(message.cc)}`);
  if (message.replyTo) headers.push(`Reply-To: ${addressList([message.replyTo])}`);
  headers.push(`Subject: ${encodeHeaderValue(message.subject)}`);
  headers.push(`Message-ID: ${message.messageId}`);
  if (message.inReplyTo) headers.push(`In-Reply-To: ${message.inReplyTo}`);
  if (message.references && message.references.length > 0) {
    headers.push(`References: ${message.references.join(" ")}`);
  }
  headers.push("MIME-Version: 1.0");
  headers.push("Auto-Submitted: auto-generated");

  const alternative = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64Encode(new TextEncoder().encode(message.text))),
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(base64Encode(new TextEncoder().encode(message.html))),
    `--${altBoundary}--`,
  ].join(CRLF);

  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return `${headers.join(CRLF)}${CRLF}${CRLF}${alternative}${CRLF}`;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  const parts: string[] = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    alternative,
  ];
  for (const attachment of attachments) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.mimeType}; name="${encodeHeaderValue(attachment.fileName)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeHeaderValue(attachment.fileName)}"`,
      "",
      wrap(base64Encode(attachment.bytes)),
    );
  }
  parts.push(`--${mixedBoundary}--`);
  return `${headers.join(CRLF)}${CRLF}${CRLF}${parts.join(CRLF)}${CRLF}`;
}

/* ------------------------------------------------------------- التحليل */

export type ParsedAttachment = {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  inline: boolean;
  contentId: string | null;
};

export type ParsedMessage = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  subject: string;
  fromAddress: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: ParsedAttachment[];
};

function decodeBytes(bytes: Uint8Array, charset: string): string {
  const label = charset.trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decodeQuotedPrintable(input: string): Uint8Array {
  const joined = input.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < joined.length; i += 1) {
    const char = joined[i]!;
    if (char === "=" && /^[0-9a-f]{2}$/i.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = char.charCodeAt(0);
      if (code <= 0xff) out.push(code);
      else for (const b of new TextEncoder().encode(char)) out.push(b);
    }
  }
  return new Uint8Array(out);
}

/** فك ترميز RFC 2047 في الرؤوس (Subject/From). */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_all, charset: string, encoding: string, data: string) => {
      try {
        const bytes =
          encoding.toLowerCase() === "b"
            ? base64Decode(data)
            : decodeQuotedPrintable(data.replace(/_/g, " "));
        return decodeBytes(bytes, charset);
      } catch {
        return data;
      }
    },
  );
}

type HeaderMap = Map<string, string[]>;

function splitHeaders(section: string): HeaderMap {
  const unfolded = section.replace(/\r?\n[ \t]+/g, " ");
  const map: HeaderMap = new Map();
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    map.set(key, [...(map.get(key) ?? []), value]);
  }
  return map;
}

function header(map: HeaderMap, key: string): string {
  return map.get(key)?.[0] ?? "";
}

function parameterOf(value: string, name: string): string | null {
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(value);
  if (quoted?.[1]) return quoted[1];
  const bare = new RegExp(`${name}\\s*=\\s*([^;\\s]+)`, "i").exec(value);
  return bare?.[1] ?? null;
}

function parseAddress(raw: string): { address: string; name: string | null } {
  const decoded = decodeEncodedWords(raw).trim();
  const angled = /<([^>]+)>/.exec(decoded);
  if (angled?.[1]) {
    const name = decoded.slice(0, angled.index).trim().replace(/^"|"$/g, "");
    return { address: angled[1].trim().toLowerCase(), name: name || null };
  }
  return { address: decoded.replace(/^"|"$/g, "").trim().toLowerCase(), name: null };
}

function parseAddresses(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((part) => parseAddress(part).address)
    .filter((a) => a.includes("@"));
}

type Part = { headers: HeaderMap; body: Uint8Array };

function bodyBytes(headers: HeaderMap, rawBody: string): Uint8Array {
  const encoding = header(headers, "content-transfer-encoding").toLowerCase();
  if (encoding.includes("base64")) return base64Decode(rawBody);
  if (encoding.includes("quoted-printable")) return decodeQuotedPrintable(rawBody);
  const out = new Uint8Array(rawBody.length);
  for (let i = 0; i < rawBody.length; i += 1) out[i] = rawBody.charCodeAt(i) & 0xff;
  return out;
}

function walk(rawSection: string, into: { parts: Part[] }, depth = 0): void {
  if (depth > 8) return;
  const separator = /\r?\n\r?\n/.exec(rawSection);
  const headerSection = separator ? rawSection.slice(0, separator.index) : rawSection;
  const body = separator ? rawSection.slice(separator.index + separator[0].length) : "";
  const headers = splitHeaders(headerSection);
  const contentType = header(headers, "content-type").toLowerCase();

  if (contentType.startsWith("multipart/")) {
    const marker = parameterOf(header(headers, "content-type"), "boundary");
    if (!marker) return;
    const segments = body.split(
      new RegExp(`--${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(--)?\\r?\\n?`),
    );
    for (const segment of segments.slice(1)) {
      if (!segment || segment === "--" || !segment.trim()) continue;
      walk(segment, into, depth + 1);
    }
    return;
  }
  into.parts.push({ headers, body: bodyBytes(headers, body) });
}

/** يحوّل الرسالة الخام (RFC 822) إلى بنية قابلة للاستيعاب. */
export function parseMimeMessage(raw: Uint8Array): ParsedMessage {
  // الرسالة الخام تُعالج كـ latin1 لأن الترميز الفعلي يُفك على مستوى كل جزء.
  let source = "";
  const step = 0x8000;
  for (let i = 0; i < raw.length; i += step) {
    source += String.fromCharCode(...raw.subarray(i, i + step));
  }

  const separator = /\r?\n\r?\n/.exec(source);
  const topHeaders = splitHeaders(separator ? source.slice(0, separator.index) : source);
  const collected = { parts: [] as Part[] };
  walk(source, collected);

  let html: string | null = null;
  let text: string | null = null;
  const attachments: ParsedAttachment[] = [];

  for (const part of collected.parts) {
    const contentTypeRaw = header(part.headers, "content-type");
    const contentType = (contentTypeRaw.split(";")[0] ?? "").trim().toLowerCase() || "text/plain";
    const disposition = header(part.headers, "content-disposition").toLowerCase();
    const charset = parameterOf(contentTypeRaw, "charset") ?? "utf-8";
    const fileName =
      parameterOf(header(part.headers, "content-disposition"), "filename") ??
      parameterOf(contentTypeRaw, "name");

    const isAttachment = disposition.includes("attachment") || Boolean(fileName);
    if (!isAttachment && contentType === "text/html") {
      html = (html ?? "") + decodeBytes(part.body, charset);
      continue;
    }
    if (!isAttachment && contentType === "text/plain") {
      text = (text ?? "") + decodeBytes(part.body, charset);
      continue;
    }
    if (part.body.length === 0) continue;
    attachments.push({
      fileName: decodeEncodedWords(fileName ?? "attachment"),
      mimeType: contentType,
      bytes: part.body,
      inline: disposition.includes("inline"),
      contentId: (header(part.headers, "content-id") || null)?.replace(/^<|>$/g, "") ?? null,
    });
  }

  const from = parseAddress(header(topHeaders, "from"));
  const references = header(topHeaders, "references")
    .split(/\s+/)
    .map((r) => r.trim())
    .filter((r) => r.startsWith("<"));

  return {
    messageId: header(topHeaders, "message-id").trim() || null,
    inReplyTo: header(topHeaders, "in-reply-to").trim() || null,
    references,
    subject: decodeEncodedWords(header(topHeaders, "subject")).trim(),
    fromAddress: from.address,
    fromName: from.name,
    to: parseAddresses(header(topHeaders, "to")),
    cc: parseAddresses(header(topHeaders, "cc")),
    deliveredTo: [
      ...parseAddresses(header(topHeaders, "delivered-to")),
      ...parseAddresses(header(topHeaders, "x-delivered-to")),
    ],
    originalTo: [
      ...parseAddresses(header(topHeaders, "x-original-to")),
      ...parseAddresses(header(topHeaders, "envelope-to")),
      ...parseAddresses(header(topHeaders, "x-forwarded-to")),
    ],
    date: header(topHeaders, "date").trim() || null,
    html,
    text,
    attachments,
  };
}
