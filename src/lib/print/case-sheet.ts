import { CASE_PRIORITY, CASE_STATUS, CLIENT_ROLE, DEADLINE_STATUS, HEARING_STATUS, fmtDate, fmtDateTime } from "@/lib/enums";

/**
 * Builds the printable case sheet. Internal notes are deliberately excluded:
 * a printed page can leave the office, so only case facts go on paper.
 */

type Row = Record<string, unknown>;

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value).replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&#39;",
  );
}

function definitionTable(pairs: [string, unknown][]): string {
  return `<table><tbody>${pairs
    .map(([label, value]) => `<tr><th style="width:28%">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function listTable(title: string, headers: string[], rows: string[][]): string {
  if (!rows.length) return `<h2>${escapeHtml(title)}</h2><p>لا توجد بيانات مسجّلة.</p>`;
  return `<h2>${escapeHtml(title)}</h2><table><thead><tr>${headers
    .map((h) => `<th>${escapeHtml(h)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function buildCaseSheetHtml(input: {
  caseRow: Row & { client?: { full_name?: string } | null; lawyer?: { full_name?: string } | null };
  parties: Row[];
  hearings: Row[];
  deadlines: Row[];
  tasks: Row[];
  updates: Row[];
}): string {
  const c = input.caseRow;
  return `
  <h1>${escapeHtml(c.case_title)}</h1>
  ${definitionTable([
    ["رقم القضية", c.case_number],
    ["رمز المتابعة", c.public_code],
    ["الحالة", CASE_STATUS[String(c.status)] ?? c.status],
    ["الأولوية", CASE_PRIORITY[String(c.priority)] ?? c.priority],
    ["نوع القضية", c.case_type],
    ["العميل", c.client?.full_name],
    ["صفة العميل", c.client_role ? CLIENT_ROLE[String(c.client_role)] : null],
    ["الخصم", c.opponent_name],
    ["المحكمة", c.court_name],
    ["الفرع", c.court_branch],
    ["الدائرة", c.judicial_circuit],
    ["القاضي", c.judge_name],
    ["المحامي المسؤول", c.lawyer?.full_name],
    ["تاريخ الفتح", fmtDate(c.opened_at as string | null)],
    ["الإجراء القادم", c.next_action],
    ["تاريخ الإجراء القادم", fmtDateTime(c.next_action_date as string | null)],
  ])}
  ${c.description ? `<h2>وصف القضية</h2><p>${escapeHtml(c.description)}</p>` : ""}
  ${listTable(
    "الأطراف والخصوم",
    ["الطرف", "النوع", "الصفة النظامية", "الممثل"],
    input.parties.map((p) => [
      String(p.party_name ?? ""),
      String(p.party_type ?? ""),
      String(p.legal_role ?? ""),
      String(p.representative_name ?? ""),
    ]),
  )}
  ${listTable(
    "الجلسات",
    ["الجلسة", "التاريخ والوقت", "المحكمة", "الحالة"],
    input.hearings.map((h) => [
      String(h.title ?? ""),
      fmtDateTime(h.hearing_date as string | null),
      String(h.court_name ?? ""),
      HEARING_STATUS[String(h.status)] ?? String(h.status ?? ""),
    ]),
  )}
  ${listTable(
    "المهل النظامية",
    ["المهلة", "تاريخ الاستحقاق", "الحالة"],
    input.deadlines.map((d) => [
      String(d.title ?? ""),
      fmtDate(d.due_date as string | null),
      DEADLINE_STATUS[String(d.status)] ?? String(d.status ?? ""),
    ]),
  )}
  ${listTable(
    "المهام",
    ["المهمة", "الاستحقاق", "الحالة"],
    input.tasks.map((t) => [String(t.title ?? ""), fmtDate(t.due_date as string | null), String(t.status ?? "")]),
  )}
  ${listTable(
    "سجل التحديثات",
    ["التاريخ", "العنوان", "التفاصيل"],
    input.updates.map((u) => [
      fmtDateTime(u.event_date as string | null),
      String(u.title ?? ""),
      String(u.description ?? ""),
    ]),
  )}`;
}