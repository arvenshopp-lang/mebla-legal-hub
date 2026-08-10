# FEATURE 02 — أداء الفريق ومؤشر الأداء التشغيلي (KPI Engine)

## 1) ما فحصته فعلياً (الواقع الحالي، لا افتراضات)

**الجداول والأعمدة الحقيقية:**

- `tasks`: `organization_id, case_id, title, description, assigned_to, created_by, due_date (timestamptz, nullable), priority, status (task_status), completed_at (nullable), created_at, updated_at`
- `deadlines`: `organization_id, case_id, title, deadline_type, due_date (NOT NULL), status (deadline_status), priority, responsible_user_id (nullable), completed_at, created_by, created_at, updated_at`
- `cases`: `assigned_lawyer_id, status (case_status), priority, opened_at, closed_at, last_activity_at, created_by`
- `hearings`: `case_id, hearing_date, status (scheduled/completed/postponed/cancelled/missed), result, notes, created_by` — **لا يوجد أي عمود مسؤولية أو حضور لموظف**
- `organization_members`: `organization_id, user_id, role (app_role), status (member_status), joined_at`
- `profiles`: `full_name, email, job_title, is_active` (لا يوجد `organization_id` داخلها)
- `activity_logs`: عام (`action, entity_type, entity_id, metadata, actor_name`) لكنه **غير مستخدم للمهام والمهل** — الكتابة فيه من الإدارة والمستندات والدعوات فقط.

**الحالات:** `task_status`: pending / in_progress / completed / cancelled / overdue. `deadline_status`: active / completed / cancelled / overdue.

**مسار الكتابة الحالي:** المهام والمهل تُكتب **مباشرة من المتصفح** عبر RLS (`src/routes/_authenticated/tasks.tsx`, `deadlines.tsx`) — بما فيها `completed_at: new Date().toISOString()` من العميل. لا توجد دالة خادم لهما.

**RLS:** `tasks/deadlines`: القراءة لكل عضو (`private.is_organization_member`)، الكتابة لـ owner/admin/lawyer/legal_assistant، الحذف للمالك/المدير أو المُنشئ. عزل المكاتب مضمون في القاعدة.

**الفهارس القائمة:** لكل من tasks/deadlines: `organization_id`, `case_id`, `assigned_to`, `due_date`, `status`. لا فهارس على `completed_at` ولا فهارس مركّبة.

**البنية القابلة لإعادة الاستخدام:** `createServerFn` + `requireSupabaseAuth`، نمط `requireMember/requireManager` في `office-page.ops.server.ts`، `buildCsv/csvCell` للتصدير الآمن، `activity_logs` للتدقيق، توقيت `Asia/Riyadh` في `print.shared.ts` و`mcp/helpers.ts`، لوحة `dashboard.tsx` كنمط بطاقات، `use-auth` لـ `activeOrgId`.

## 2) ما لا يصلح للـ KPI حالياً

| المصدر | السبب |
| --- | --- |
| الجلسات (`hearings`) | لا مسؤولية ولا حضور لموظف. الاستنتاج من القضية = اختراع بيانات → **مستثنى من الدرجة** (سياق فقط). |
| عدد القضايا | لا يوجد نموذج تعقيد → عبء عمل وسياق فقط، بلا مكافأة. |
| تاريخ إعادة الإسناد | **غير مسجّل إطلاقاً** → لا يمكن حساب فترات المسؤولية اليوم. |
| تغيير تاريخ الاستحقاق | **غير مسجّل** → لا خط أساس تاريخي. |
| `completed_at` | يُرسل من العميل → **قابل للتلاعب (Backdating)**. |
| إغلاق القضايا | `closed_at` بلا مسؤول مؤكَّد → مستثنى من الدرجة. |
| مهام بلا `due_date` | لا تدخل مقامات الالتزام؛ تدخل معدل الإنجاز فقط. |

## 3) الأبعاد المقترحة والصِيَغ (v1)

المقام الأهلي: العناصر التي **استُحقّت أو أُنجزت داخل الفترة** وتُنسب للعضو حسب فترات المسؤولية.

1. **الالتزام بالمهل** `D = مهل مُنجزة في وقتها ÷ (مُنجزة + متأخرة الإنجاز + فائتة مفتوحة)` — وزن 30%
2. **الإنجاز في الوقت للمهام** `T = مهام أُنجزت ≤ الاستحقاق الأساسي ÷ مهام مُنجزة لها تاريخ استحقاق` — 25%
3. **معدل الإنجاز** `C = مُنجزة ÷ (مُنجزة + مفتوحة مستحقة داخل الفترة)` — 20%
4. **أداء التأخير** `L = 1 − (مجموع أيام التأخير المحدود بـ 14 يوماً لكل عنصر ÷ (14 × عدد العناصر المتأخرة))`، ويساوي 100% عند غياب التأخير — 15%
5. **إدارة المتراكم** `B = 1 − (المفتوح المتأخر حالياً ÷ إجمالي المفتوح)`، N/A إذا لا يوجد مفتوح — 10%

الدرجة = `round(Σ(البعد × وزنه) ÷ Σ(أوزان الأبعاد المتاحة) × 100)`. **عبء العمل ليس بعداً في الدرجة** — يُعرض مستقلاً (مهام مفتوحة، قضايا نشطة، مهل قادمة خلال 14 يوماً).

مبرر الأوزان: المهل هي المخاطرة القانونية الأعلى، ثم الالتزام الزمني، ثم الإنتاجية. أُسقطت الجلسات وعدد القضايا لعدم كفاية البيانات.

## 4) N/A، المقام صفر، حجم العيّنة، الترتيب

- بعد بمقام صفر = **N/A** (لا صفر)، ويُحذف وزنه من المقام ثم يُعاد التطبيع. إن كانت كل الأبعاد N/A → «لا يوجد نشاط في الفترة».
- **أهلية الترتيب**: ≥ 8 عناصر تشغيلية أهلية (مهام + مهل) **و** ≥ 14 يوم عضوية نشطة داخل الفترة. غير المؤهل يظهر في قسم منفصل «بيانات غير كافية للتقييم» مع إحصاءاته كاملة وبلا رقم ترتيب.
- **الترتيب**: الدرجة تنازلياً ← حجم العيّنة الأكبر ← `T` الأعلى ← نسبة المتأخر الأدنى ← `user_id` (ثبات قطعي).
- **النطاقات المركزية** (ملف واحد): 90+ ممتاز، 80–89 جيد جداً، 70–79 جيد، 60–69 يحتاج متابعة، أقل من 60 يحتاج تحسيناً. الاتجاه بـ «نقاط» لا «نسبة مئوية».
- **الفترات**: هذا الشهر / الشهر الماضي / 3 أشهر / 6 أشهر / السنة / مخصصة، بحدود يوم بتوقيت الرياض، والمقارنة بفترة سابقة **بنفس عدد الأيام**.

## 5) قواعد النسبة والعدالة (Anti-Gaming)

- **الإسناد بفترات المسؤولية**: العنصر يُنسب لمن كان مسؤولاً وقت الاستحقاق أو الإنجاز؛ ومن استلمه قبل أقل من 20% من عمره أو قبل ≤ 3 أيام من الاستحقاق لا يتحمّل تأخيراً سابقاً (يُنسب لصاحب الفترة الأطول قبل الاستحقاق).
- **خط أساس الاستحقاق**: يُستخدم **أول تاريخ استحقاق مسجّل** إن غُيّر بعد الإسناد؛ التمديد المشروع مسموح تشغيلياً لكنه لا يمحو تأخيراً سابقاً.
- **الإنجاز**: `completed_at` يُثبَّت خادمياً بـ `now()` عبر مُشغّل → لا Backdating.
- **إعادة الفتح** بعد الإنجاز تُسجَّل ويُعامل العنصر كغير مُنجز، مع بقاء واقعة التأخير الأولى.
- **الحذف**: العناصر المحذوفة بعد تجاوز استحقاقها تبقى في التاريخ عبر سجل الأحداث.
- **الملغى** (`cancelled`) يُستثنى من كل المقامات (لا نجاح ولا فشل)، إلا إذا أُلغي بعد تأخّر يتجاوز 3 أيام → يبقى في مقام التأخير.
- **القضايا المؤرشفة/المغلقة**: مهامها ومهلها تبقى محسوبة تاريخياً.
- **مهام صغيرة يُنشئها العضو لنفسه**: تُستثنى المهام التي أنشأها العضو وأنجزها خلال أقل من 15 دقيقة من الإنشاء.
- **العضو المُزال**: بياناته التاريخية تبقى بالاسم من `profiles` مع وسم «عضو سابق»، بلا أي استرجاع وصول.

## 6) الصلاحيات والعزل

- الوصول للصفحة: `owner` و`admin` فقط (لوحة الفريق كاملة) وفق نموذج الأدوار القائم.
- `lawyer` و`legal_assistant` يرون **مؤشرهم الشخصي فقط** عبر نفس الدالة بنطاق مقيّد خادمياً؛ `viewer` لا يرى شيئاً.
- التحقق كله على الخادم داخل `createServerFn` + `requireSupabaseAuth` + `requireOfficeManager(userId, organizationId)`؛ `organization_id` القادم من المتصفح يُتحقق منه ولا يُثق به، و`member_id` يُتحقق من انتمائه لنفس المكتب. الإخفاء في الواجهة تحسين تجربة لا حماية.
- الحساب يجري بعميل المستخدم (RLS سارية) — بلا `service_role` وبلا `SECURITY DEFINER` جديد.

## 7) المعمارية الحسابية

- **حساب فوري خادمي** بلا تخزين مؤقت ولا مهام خلفية: دالة خادم تسحب صفوف المهام/المهل/القضايا للفترة بأعمدة محدودة وتحسب في محرك TypeScript خالص قابل للاختبار.
- المبرر: حجم البيانات لمكتب واحد (مئات إلى آلاف الصفوف) أقل من تكلفة أي Materialized View أو لقطات، ويحافظ على شرح فوري دقيق.
- **فهارس مطلوبة (جديدة، غير مكرَّرة)**: `tasks(organization_id, assigned_to, due_date)`، `tasks(organization_id, completed_at)`، `deadlines(organization_id, responsible_user_id, due_date)`، `deadlines(organization_id, completed_at)`.
- Drill-down بترقيم صفحات مستقل (20 صفاً) عبر استعلام منفصل، لا داخل الحساب.

## 8) هل نحتاج تخزيناً جديداً؟ نعم — الأدنى الممكن

جدول واحد: `work_item_events` (سجل تاريخي غير قابل للتعديل)
`id, organization_id, item_type ('task'|'deadline'), item_id, event ('created'|'assigned'|'due_changed'|'completed'|'reopened'|'cancelled'|'deleted'), actor_id, from_user_id, to_user_id, from_due_date, to_due_date, occurred_at (default now()), metadata jsonb`

- يُملأ بمُشغّلات (AFTER INSERT/UPDATE/DELETE) على `tasks` و`deadlines` — بلا تغيير في مخطط الجدولين ولا في واجهاتهما.
- مُشغّل ثانٍ (BEFORE) يفرض `completed_at = now()` عند الانتقال إلى `completed`، ويمنع تعديل أو حذف صفوف السجل.
- GRANT: `SELECT` لـ `authenticated`، `ALL` لـ `service_role`، لا `anon`. RLS: القراءة لأعضاء المكتب النشطين فقط؛ لا INSERT/UPDATE/DELETE من أي عميل.
- **بدون هذا الجدول**: الإسناد بفترات المسؤولية وخط أساس الاستحقاق ومنع Backdating غير قابلة للتنفيذ، وستُعرض الأبعاد المتأثرة كـ N/A. لذلك هو شرط للقبول.
- الفترة الأولى بعد التشغيل تحتوي تاريخاً جزئياً: غياب حدث `assigned` = إسناد أصلي من `created_at`، وغياب `due_changed` = خط أساس هو `due_date` الحالي. الفترات السابقة لتاريخ التشغيل تُوسَم «تاريخ جزئي».

## 9) الواجهات الجديدة

- `src/routes/_authenticated/team-performance.tsx` — «أداء الفريق»: منقّي الفترة، بطاقات الملخّص مع فرق الفترة، جدول الترتيب (سطح مكتب) وبطاقات (جوال)، توزيع النطاقات كأشرطة بسيطة، قسم «بيانات غير كافية».
- `src/routes/_authenticated/team-performance.$memberId.tsx` — تفصيل العضو: رأس (الاسم، الدور، الدرجة، الاتجاه بالنقاط)، الأبعاد بنسبها ومقاماتها، أعداد فعلية، عبء العمل، المتأخرات، ثم Drill-down.
- `src/components/team-performance/`: `period-filter.tsx`, `summary-cards.tsx`, `ranking-table.tsx`, `member-card.tsx`, `score-badge.tsx`, `dimension-bar.tsx`, `distribution.tsx`, `drilldown-sheet.tsx`, `insufficient-data.tsx`.
- `src/lib/kpi/kpi.shared.ts` (الأنواع، الأوزان، النطاقات، حدود العيّنة، حساب الفترات بتوقيت الرياض)، `kpi.engine.ts` (رياضيات خالصة)، `kpi.server.ts` (السحب + الحرّاس + الإسناد)، `kpi.functions.ts` (`getTeamPerformance`, `getMemberPerformance`, `getKpiDrilldown`, `exportTeamPerformanceCsv`).
- رابط في `src/components/dashboard/shell.tsx` للمالك والمدير فقط، وبطاقة تحويل في `dashboard.tsx`.
- لا رسوم معقدة، لا كؤوس ولا أوسمة؛ لغة نطاقات محيّدة، RTL كامل.

## 10) الجوال والوصول

اختبار فعلي على 320 / 390 / 430 / 768 / 1024 / 1440: بلا تمرير أفقي، بطاقات عضو بديلة عن الجدول تحت 768، أهداف لمس ≥ 44px، Drill-down كـ Bottom Sheet على الجوال وDialog على سطح المكتب، تنقّل لوحة مفاتيح وقارئ شاشة كامل، احترام `prefers-reduced-motion`.

## 11) التصدير والتدقيق والخصوصية

- تصدير CSV للمالك والمدير فقط عبر `buildCsv` القائم (UTF-8 + BOM + حماية حقن الصِيَغ)، بنطاق المكتب وتحقق خادمي — **لا إطار تصدير جديد**.
- تدقيق في `activity_logs` لحدثين فقط: `team_kpi.exported` و`team_kpi.member_viewed`. لا تدقيق لكل عرض للوحة.
- خصوصية: **لا** إرسال أي درجة أو اسم موظف أو عنوان مهمة أو قضية إلى PostHog؛ فقط `kpi_page_viewed` بمدى الفترة كنص محدود.

## 12) الملفات والترحيلات المتوقعة

ترحيل واحد: `work_item_events` + GRANT + RLS + مُشغّلات المهام والمهل + تثبيت `completed_at` + 4 فهارس.
ملفات جديدة: `src/lib/kpi/*` (4)، مسارَان، 9 مكوّنات، `scripts/e2e/f02/*`.
تعديل محدود: `src/components/dashboard/shell.tsx`, `src/routes/_authenticated/dashboard.tsx`، ووثيقة `docs/team-kpi-architecture.md`. **لا تعديل على منطق صفحتي المهام والمهل.**

## 13) خطة القبول (E2E)

بيانات ثابتة بمكتبين وخمسة أعضاء وتواريخ محسوبة مسبقاً ودرجات متوقعة محسوبة يدوياً داخل الاختبار:
A إنجاز عالٍ في الوقت، B تأخيرات متكررة، C متراكم متأخر، D عنصران فقط → «بيانات غير كافية»، E بلا مهل → البعد N/A ولا صفر.
حالات إضافية: إعادة إسناد قبل يوم من الاستحقاق، تغيير تاريخ الاستحقاق، إعادة فتح مُنجز، إلغاء، أرشفة، عضو مُزال، طلبات متزامنة ومكرّرة، تعادل درجات، مقامات صفرية (بلا NaN ولا قسمة على صفر ولا ترتيب غير ثابت).
أمان: مالك A / عضو A / مالك B / عضو B بجلسات حقيقية (لا `service_role`) مع محاولات تلاعب بـ `organization_id` و`member_id` → رفض عربي واضح.
انحدار مستهدف: المهام، المهل، القضايا، الجلسات، الفريق، RBAC، لوحة التحكم، الإشعارات، بوابة العميل. **Feature 01 لا تُفتح.**
شرط الإغلاق: FAIL = 0 و NOT TESTED = 0، مع نجاح Type Check وESLint والبناء.

## 14) المخاطر

1. **التاريخ الجزئي** قبل تشغيل السجل — مُعالج بوسم صريح دون ادّعاء دقة تامة للفترات القديمة.
2. حالة `overdue` في الجدولين تُحدَّث يدوياً حالياً؛ المحرك يعتمد **الحساب الزمني** (`due_date < now()`) لا الحالة المخزّنة.
3. `due_date` في المهام قابل للفراغ → استثناء صريح من مقامات الالتزام.
4. لا يوجد Blocker معماري.

## التصنيف

- **REUSE**: `organization_members` وRLS، `tasks`, `deadlines`, `cases`, `activity_logs`, `profiles`، `createServerFn` + `requireSupabaseAuth`، نمط `requireMember/requireManager`، `buildCsv`، تقويم الرياض، Shell وبطاقات اللوحة.
- **NEW REQUIRED**: جدول `work_item_events` ومُشغّلاته، تثبيت `completed_at`، 4 فهارس، محرك `src/lib/kpi/*`، صفحتان ومكوّناتهما، حزمة `scripts/e2e/f02`.
- **NOT REQUIRED**: Materialized Views، لقطات، مهام خلفية، `SECURITY DEFINER` جديد، تعديل مخطط المهام والمهل، إطار تصدير جديد، تعديل RBAC المنصة.
- **DEFERRED**: KPI للجلسات (بعد إضافة مسؤولية أو حضور)، نموذج تعقيد القضايا، أوزان لكل مكتب، تقييم يدوي أو HR، رضا العملاء، Excel، لقطات يومية عند نمو الحجم.

READY FOR FEATURE 02 — TEAM PERFORMANCE KPI BUILD