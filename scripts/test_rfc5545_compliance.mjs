/**
 * اختبار وتحقق شامل لـ RFC 5545 وتوافق Apple Calendar
 */
import { generateIcsCalendar } from "../src/lib/calendar/ics-engine.server.ts";

console.log("================================================================================");
console.log("🧪 TESTING RFC 5545 & APPLE CALENDAR SPECIFICATION VALIDATOR");
console.log("================================================================================\n");

const sampleEvents = [
  {
    id: "hearing-1",
    sourceType: "hearing",
    sourceId: "h-12345",
    title: "جلسة المرافعة الأولى - دعوى تجارية",
    description: "جلسة نظر الدعوى المقامة أمام الدائرة التجارية التاسعة بالمحكمة التجارية بالرياض",
    category: "hearing",
    startDate: new Date(Date.now() + 86400000).toISOString(),
    endDate: new Date(Date.now() + 90000000).toISOString(),
    courtName: "المحكمة التجارية بالرياض",
    judicialCircuit: "الدائرة التجارية التاسعة",
    location: "القاعة 4 - الدور الثاني",
    remoteLink: "https://najiz.sa/hearing/12345",
    caseNumber: "45109823",
    caseTitle: "دعوى مطالبة مالية وتوريد",
    clientName: "شركة اليمامة للمقاولات",
    status: "scheduled",
    url: "https://mehlalex.com/cases/case-123",
  },
];

const ics = generateIcsCalendar(sampleEvents);
console.log("=== GENERATED ICS (First 1500 chars) ===");
console.log(ics.slice(0, 1500));
console.log("========================================\n");

// Validations:
const checks = [
  { name: "Starts with BEGIN:VCALENDAR", pass: ics.startsWith("BEGIN:VCALENDAR") },
  { name: "Ends with END:VCALENDAR", pass: ics.trim().endsWith("END:VCALENDAR") },
  { name: "VERSION:2.0 present", pass: ics.includes("VERSION:2.0") },
  { name: "PRODID present", pass: ics.includes("PRODID:") },
  { name: "CALSCALE:GREGORIAN present", pass: ics.includes("CALSCALE:GREGORIAN") },
  { name: "VTIMEZONE Block present", pass: ics.includes("BEGIN:VTIMEZONE") && ics.includes("END:VTIMEZONE") },
  { name: "VEVENT Block present", pass: ics.includes("BEGIN:VEVENT") && ics.includes("END:VEVENT") },
  { name: "UID format valid", pass: /UID:mehla-[a-zA-Z0-9_-]+@mehlalex\.com/.test(ics) },
  { name: "DTSTART & DTEND formatted in UTC", pass: /DTSTART:\d{8}T\d{6}Z/.test(ics) && /DTEND:\d{8}T\d{6}Z/.test(ics) },
  { name: "Line endings are strict CRLF (\\r\\n)", pass: ics.includes("\r\n") && !ics.replace(/\r\n/g, "").includes("\n") },
  { name: "VALARM Alarm Trigger valid", pass: ics.includes("BEGIN:VALARM") && ics.includes("TRIGGER:-PT") },
];

let allPassed = true;
for (const check of checks) {
  if (check.pass) {
    console.log(`✓ ${check.name}: PASSED`);
  } else {
    console.log(`❌ ${check.name}: FAILED`);
    allPassed = false;
  }
}

console.log("\n================================================================================");
console.log(allPassed ? "🎉 ALL RFC 5545 & APPLE CALENDAR CHECKS PASSED!" : "⚠️ SOME CHECKS FAILED");
console.log("================================================================================");
