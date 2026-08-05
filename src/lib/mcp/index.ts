/**
 * تعريف خادم MCP لمنصة مِهلة.
 *
 * محمي بـ OAuth 2.1: كل عميل (Claude / ChatGPT / Cursor) يتصل بهوية مستخدم
 * حقيقي في المنصة، وكل استعلام يمر بسياسات RLS بهوية ذلك المستخدم.
 * لا قراءة بيئة ولا أي أثر عند الاستيراد — القيم تُقرأ داخل المعالجات.
 */
import { auth, defineMcp } from "@lovable.dev/mcp-js";
import createTaskTool from "./tools/create-task";
import getCaseTool from "./tools/get-case";
import listCasesTool from "./tools/list-cases";
import listTasksTool from "./tools/list-tasks";
import searchClientsTool from "./tools/search-clients";
import upcomingDeadlinesTool from "./tools/upcoming-deadlines";
import upcomingHearingsTool from "./tools/upcoming-hearings";

// مُصدر الرموز لا بد أن يكون مضيف قاعدة البيانات المباشر؛ يُبنى من معرّف
// المشروع الذي يُثبَّت وقت البناء ويبقى صالحاً بعد النشر.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "mehla-legal-practice-platform",
  title: "Mehla | Legal Practice Platform",
  version: "1.0.0",
  instructions:
    "أدوات منصة مِهلة لإدارة الممارسة القانونية السعودية. تعمل بهوية المستخدم المتصل وداخل مكتبه فقط: " +
    "list_cases وget_case لملفات القضايا، upcoming_hearings وupcoming_deadlines للجلسات والمهل بتوقيت الرياض، " +
    "list_tasks وcreate_task للمهام، وsearch_clients لبيانات العملاء التعريفية دون أي بيانات حساسة. " +
    "عند العضوية في أكثر من مكتب، مرّر organization_id الذي تعيده رسالة التوضيح.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listCasesTool,
    getCaseTool,
    upcomingHearingsTool,
    upcomingDeadlinesTool,
    listTasksTool,
    createTaskTool,
    searchClientsTool,
  ],
});
