/**
 * محرك توليد ملفات وتدفقات iCalendar (RFC 5545) المتوافقة مع أبل وجوجل ومايكروسوفت
 * RFC 5545 Compliant iCalendar Generator Engine
 */
import type { CalendarEventModel } from "./calendar.shared";

/** تنسيق التاريخ والوقت لـ UTC وفق iCalendar: YYYYMMDDTHHMMSSZ */
function formatIcsDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** تشفير وتنسيق النصوص حسب متطلبات RFC 5545 (تجاوز الفواصل والأسطر) */
function escapeIcsText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** تقسيم السطور الطويلة (Line Folding) بما لا يتجاوز 75 بايت وفق RFC 5545 */
function foldLine(line: string): string {
  const maxBytes = 75;
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);

  if (bytes.length <= maxBytes) return line;

  let folded = "";
  let currentChunk = "";
  let currentByteLen = 0;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const charBytes = encoder.encode(char).length;

    if (currentByteLen + charBytes > (folded.length === 0 ? maxBytes : maxBytes - 1)) {
      folded += (folded.length === 0 ? "" : "\r\n ") + currentChunk;
      currentChunk = char;
      currentByteLen = charBytes;
    } else {
      currentChunk += char;
      currentByteLen += charBytes;
    }
  }

  if (currentChunk) {
    folded += (folded.length === 0 ? "" : "\r\n ") + currentChunk;
  }

  return folded;
}

/** توليد محتوى iCalendar VCALENDAR الكامل */
export function generateIcsCalendar(
  events: CalendarEventModel[],
  options: {
    calendarName?: string;
    calendarDesc?: string;
    alarmMinutesBefore?: number[];
  } = {},
): string {
  const calendarName = options.calendarName || "مِهلة | الجلسات والمهل القضائية";
  const calendarDesc =
    options.calendarDesc || "التقويم الموحد للجلسات القضائية والمهل الإجرائية والمهام - منصة مِهلة القانونية";
  const alarms = options.alarmMinutesBefore || [1440, 120]; // 24 hours & 2 hours before

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MEHLA Legal Hub//Unified Calendar Sync v2.0//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-CALDESC:${escapeIcsText(calendarDesc)}`,
    "X-WR-TIMEZONE:Asia/Riyadh",
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];

  const nowStamp = formatIcsDateTime(new Date().toISOString());

  for (const ev of events) {
    const dtStart = formatIcsDateTime(ev.startDate);
    const dtEnd = formatIcsDateTime(ev.endDate);
    const uid = `mehla-${ev.sourceType}-${ev.sourceId}@mehlalex.com`;

    // Construct Detailed Rich Arabic Description
    let desc = `🏛️ منصة مِهلة القانونية\n`;
    desc += `📌 الحدث: ${ev.title}\n`;
    if (ev.caseNumber) desc += `📂 رقم القضية: ${ev.caseNumber}\n`;
    if (ev.caseTitle) desc += `📜 عنوان القضية: ${ev.caseTitle}\n`;
    if (ev.clientName) desc += `👤 الموكل: ${ev.clientName}\n`;
    if (ev.courtName) desc += `⚖️ المحكمة: ${ev.courtName}\n`;
    if (ev.judicialCircuit) desc += `🏢 الدائرة القضائية: ${ev.judicialCircuit}\n`;
    if (ev.location) desc += `📍 المقر/القاعة: ${ev.location}\n`;
    if (ev.remoteLink) desc += `🌐 رابط الجلسة عن بُعد: ${ev.remoteLink}\n`;
    if (ev.description) desc += `\n📝 ملاحظات وتفاصيل:\n${ev.description}\n`;
    desc += `\n🔗 رابط القضية في مِهلة: ${ev.url}`;

    // Event Location
    const eventLocation = ev.remoteLink || ev.location || ev.courtName || "عن بُعد / المحكمة";

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);
    lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
    lines.push(`LOCATION:${escapeIcsText(eventLocation)}`);
    lines.push(`STATUS:CONFIRMED`);
    lines.push(`CATEGORIES:${ev.category === "hearing" ? "جلسة قضائية" : "مهلة قانونية"}`);
    lines.push(`URL:${ev.url}`);

    // Add Alarms / Reminders
    for (const minutes of alarms) {
      lines.push("BEGIN:VALARM");
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:تذكير مِهلة: ${escapeIcsText(ev.title)}`);
      lines.push(`TRIGGER:-PT${minutes}M`);
      lines.push("END:VALARM");
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // Format with CRLF and Line Folding
  return lines.map((l) => foldLine(l)).join("\r\n");
}
