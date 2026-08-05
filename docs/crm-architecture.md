# معمارية وحدة علاقات العملاء (CRM)

## الهدف والنطاق

وحدة CRM ضمن لوحة إدارة المنصة (`mehla-admin`) تُدير خط مبيعات المنصة نفسها: العملاء المحتملون (Leads)، الشركات، جهات الاتصال، الصفقات، مراحل خط البيع، والأنشطة (اجتماعات/مكالمات/مهام). لا علاقة لها ببيانات المكاتب القانونية (العملاء/القضايا) — هذه بيانات مبيعات المنصة تجاه المكاتب المحتملة والحالية كعملاء للمنصة.

جميع القراءات والكتابات تمر عبر دوال خادم (`createServerFn`) في `src/lib/crm.functions.ts`، وتستخدم عميل Supabase الإداري (`admin()` من `admin-guard.server.ts`) بعد التحقق من صلاحية `crm.*` الخاصة بالعملية. الأنواع والتسميات المشتركة موجودة في `src/lib/crm.shared.ts`.

## المسارات

- `src/routes/mehla-admin/crm.tsx`: صفحة واحدة بعلامات تبويب (tabs) داخلية، بلا توجيه فرعي فعلي في مسار الرابط:
  - `overview` → `OverviewPanel`
  - `leads` → `LeadsPanel`
  - `companies` → `CompaniesPanel`
  - `contacts` → `ContactsPanel`
  - `deals` → `DealsPanel`
  - `stages` → `StagesPanel`
  - `activities` → `ActivitiesPanel`
- الوصول للصفحة مشروط بصلاحية `crm.read` عبر `usePlatformAdmin().can("crm.read")`؛ عند غيابها تُعرض رسالة رفض دون استدعاء أي دالة خادم.
- المكوّنات في `src/components/admin/crm/`: `overview-panel.tsx`, `leads-panel.tsx`, `companies-panel.tsx`, `contacts-panel.tsx`, `deals-panel.tsx`, `stages-panel.tsx`, `activities-panel.tsx`, بالإضافة إلى نماذج الإدخال `lead-form.tsx`, `company-form.tsx`, `contact-form.tsx`, `deal-form.tsx`, `stage-form.tsx`, `activity-form.tsx`, ونوافذ `action-modals.tsx`, وأدوات مشتركة `shared.tsx`.

## الجداول والعلاقات

### `crm_leads`

| العمود                  | النوع                     |
| ----------------------- | ------------------------- |
| id                      | uuid                      |
| full_name               | text                      |
| company_name            | text?                     |
| email                   | text?                     |
| phone                   | text?                     |
| city                    | text?                     |
| status                  | enum `crm_lead_status`    |
| source                  | text?                     |
| score                   | integer                   |
| owner_staff_id          | uuid? → platform_staff.id |
| disqualify_reason       | text?                     |
| converted_at            | timestamptz?              |
| converted_company_id    | uuid? → crm_companies.id  |
| converted_contact_id    | uuid? → crm_contacts.id   |
| converted_deal_id       | uuid? → crm_deals.id      |
| last_activity_at        | timestamptz?              |
| notes                   | text?                     |
| utm                     | jsonb                     |
| created_by / updated_by | uuid?                     |
| created_at / updated_at | timestamptz               |

### `crm_companies`

| العمود                  | النوع       |
| ----------------------- | ----------- |
| id                      | uuid        |
| name                    | text        |
| legal_name              | text?       |
| sector                  | text?       |
| size_bracket            | text?       |
| city                    | text?       |
| website                 | text?       |
| email / phone           | text?       |
| status                  | text        |
| source                  | text?       |
| organization_id         | uuid?       |
| owner_staff_id          | uuid?       |
| notes                   | text?       |
| created_by / updated_by | uuid?       |
| created_at / updated_at | timestamptz |

### `crm_contacts`

| العمود                  | النوع                    |
| ----------------------- | ------------------------ |
| id                      | uuid                     |
| full_name               | text                     |
| company_id              | uuid? → crm_companies.id |
| job_title               | text?                    |
| email / phone           | text?                    |
| city                    | text?                    |
| is_primary              | boolean                  |
| owner_staff_id          | uuid?                    |
| notes                   | text?                    |
| created_by / updated_by | uuid?                    |
| created_at / updated_at | timestamptz              |

### `crm_deals`

| العمود                  | النوع                          |
| ----------------------- | ------------------------------ |
| id                      | uuid                           |
| title                   | text                           |
| amount                  | numeric                        |
| currency                | text                           |
| probability             | integer                        |
| status                  | enum `crm_deal_status`         |
| stage_id                | uuid? → crm_pipeline_stages.id |
| company_id              | uuid? → crm_companies.id       |
| contact_id              | uuid? → crm_contacts.id        |
| lead_id                 | uuid? → crm_leads.id           |
| owner_staff_id          | uuid?                          |
| source                  | text?                          |
| utm                     | jsonb                          |
| expected_close_date     | date?                          |
| closed_at               | timestamptz?                   |
| lost_reason             | text?                          |
| notes                   | text?                          |
| created_by / updated_by | uuid?                          |
| created_at / updated_at | timestamptz                    |

### `crm_pipeline_stages`

| العمود                  | النوع       |
| ----------------------- | ----------- |
| id                      | uuid        |
| name                    | text        |
| sort_order              | integer     |
| probability             | integer     |
| is_won                  | boolean     |
| is_lost                 | boolean     |
| is_active               | boolean     |
| created_at / updated_at | timestamptz |

### `crm_activities`

| العمود                                      | النوع                    |
| ------------------------------------------- | ------------------------ |
| id                                          | uuid                     |
| kind                                        | enum `crm_activity_kind` |
| entity_kind                                 | enum `crm_entity_kind`   |
| subject                                     | text                     |
| body                                        | text?                    |
| outcome                                     | text?                    |
| due_at                                      | timestamptz?             |
| completed_at                                | timestamptz?             |
| lead_id / company_id / contact_id / deal_id | uuid?                    |
| owner_staff_id                              | uuid?                    |
| created_by                                  | uuid?                    |
| created_at / updated_at                     | timestamptz              |

**العلاقات المنطقية**: `crm_leads` تتحول (عبر `convertLead`) إلى `crm_companies` + `crm_contacts` + `crm_deals`. `crm_deals.stage_id` يشير إلى `crm_pipeline_stages`. `crm_activities` ترتبط بأحد الكيانات الأربعة حسب `entity_kind`. جميع سجلات "المالك" (`owner_staff_id`) تشير إلى `platform_staff`.

## دوال الخادم

| الدالة                | الصلاحية المطلوبة                                        | Audit                                                           |
| --------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| `listPipelineStages`  | `crm.read`                                               | لا (قراءة)                                                      |
| `upsertPipelineStage` | `crm.manage_pipeline`                                    | نعم (`crm.pipeline_stage.create` / `crm.pipeline_stage.update`) |
| `deletePipelineStage` | `crm.manage_pipeline`                                    | نعم (`crm.pipeline_stage.delete`)                               |
| `listStaffOptions`    | `crm.read`                                               | لا                                                              |
| `listLeads`           | `crm.read`                                               | لا                                                              |
| `getLeadDetail`       | `crm.read`                                               | لا                                                              |
| `createLead`          | `crm.create`                                             | نعم (`crm.lead.create`)                                         |
| `updateLead`          | `crm.update`                                             | نعم (`crm.lead.update`)                                         |
| `deleteLead`          | `crm.delete`                                             | نعم (`crm.lead.delete`)                                         |
| `assignLead`          | `crm.assign`                                             | نعم (`crm.lead.assign`)                                         |
| `disqualifyLead`      | `crm.update`                                             | نعم (`crm.lead.disqualify`)                                     |
| `convertLead`         | `crm.update`                                             | نعم (`crm.lead.convert`)                                        |
| `listCompanies`       | `crm.read`                                               | لا                                                              |
| `getCompanyDetail`    | `crm.read` (+ `sales_docs.read` لجلب المستندات المرتبطة) | لا                                                              |
| `createCompany`       | `crm.create`                                             | نعم                                                             |
| `updateCompany`       | `crm.update`                                             | نعم                                                             |
| `deleteCompany`       | `crm.delete`                                             | نعم                                                             |
| `assignCompany`       | `crm.assign`                                             | نعم                                                             |
| `listContacts`        | `crm.read`                                               | لا                                                              |
| `createContact`       | `crm.create`                                             | نعم                                                             |
| `updateContact`       | `crm.update`                                             | نعم                                                             |
| `deleteContact`       | `crm.delete`                                             | نعم                                                             |
| `listDeals`           | `crm.read`                                               | لا                                                              |
| `getDealDetail`       | `crm.read` (+ `sales_docs.read`)                         | لا                                                              |
| `createDeal`          | `crm.create`                                             | نعم                                                             |
| `updateDeal`          | `crm.update`                                             | نعم                                                             |
| `deleteDeal`          | `crm.delete`                                             | نعم                                                             |
| `assignDeal`          | `crm.assign`                                             | نعم                                                             |
| `moveDealStage`       | `crm.update`                                             | نعم (`crm.deal.move_stage`)                                     |
| `listActivities`      | `crm.read`                                               | لا                                                              |
| `createActivity`      | `crm.create`                                             | نعم (`crm.activity.create`)                                     |
| `completeActivity`    | `crm.update`                                             | نعم (`crm.activity.complete`)                                   |
| `deleteActivity`      | `crm.delete`                                             | نعم (`crm.activity.delete`)                                     |
| `pipelineSummary`     | `crm.read`                                               | لا (تجميع/تقرير قراءة فقط)                                      |
| `sourceReport`        | `crm.read`                                               | لا                                                              |
| `exportCrmCsv`        | `crm.export`                                             | نعم (`crm.export`)                                              |

كل دالة كتابة تستدعي `requireStaff(context.supabase, context.userId, permission)` أولاً، ثم تُنفّذ عبر عميل `admin()`، ثم (باستثناء ما هو موثّق أعلاه) تستدعي `writeAudit`.

## الصلاحيات

الصلاحيات المعرّفة فعلياً في `src/lib/admin-permissions.ts` ضمن مجموعة «المبيعات وعلاقات العملاء»:

- `crm.read` — مشاهدة CRM
- `crm.create` — إضافة سجلات CRM
- `crm.update` — تعديل سجلات CRM (يشمل تحويل العميل المحتمل وتحريك الصفقة بين المراحل)
- `crm.delete` — حذف سجلات CRM
- `crm.assign` — إسناد العميل المحتمل أو الصفقة
- `crm.export` — تصدير CSV
- `crm.manage_pipeline` — إدارة مراحل خط البيع

مالك المنصة (`role: "super_admin"`) يتجاوز كل فحص صلاحية داخل `requireStaff`. الموظف العادي (`role: "staff"`) يحتاج الصلاحية ضمن `permissions` الشخصية أو صلاحيات دوره (`platform_roles.permissions`) بعد `expandPermissions`.

## RLS

مفعّلة على الجداول الست عبر `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (migration `20260805184021`)، وسياسات موحّدة تُنشأ عبر حلقة `DO $$ ... $$` تطبّق على كل جدول:

- `SELECT` يتطلب `private.has_platform_permission(auth.uid(), 'crm.read')`
- `INSERT` يتطلب `crm.create`
- `UPDATE` يتطلب `crm.update`
- `DELETE` يتطلب `crm.delete`

**ملاحظة**: RLS لا تفرّق بين `crm.assign` أو `crm.manage_pipeline` — هذه الصلاحيات الدقيقة مُطبّقة فقط على مستوى دوال الخادم (`requireStaff`)، وليست في مستوى قاعدة البيانات. كذلك عمليات القراءة والكتابة الفعلية تمر عبر عميل `admin()` (service role) وليس عبر جلسة المستخدم، ما يعني أن RLS هذه تُشكّل خط دفاع ثانٍ نظري وليس المسار الفعلي المُنفَّذ من طرف دوال الخادم الحالية (التي تتجاوز RLS عبر مفتاح الخدمة وتعتمد بدلاً منها على `requireStaff`).

## دورة الحياة

- **عميل محتمل**: `new → contacted → qualified → (converted | unqualified | lost)`. الاستبعاد عبر `disqualifyLead` يمنعه من الحدوث إن كانت الحالة `converted` مسبقاً. التحويل عبر `convertLead` يمنع تكرار التحويل (`status === "converted"` يرفض)، ويُنشئ أو يُطابق شركة وجهة اتصال (بحسب البريد/الجوال) وينشئ صفقة جديدة بمرحلة مُحددة، ثم يُحدّث الحقول `converted_*` على العميل المحتمل.
- **صفقة**: تبدأ `status = "open"`. `moveDealStage` يرفض تحريك صفقة ليست `open`؛ عند الانتقال إلى مرحلة `is_won` تصبح `status = "won"` مع `closed_at`؛ وعند `is_lost` تصبح `status = "lost"` مع `closed_at` و`lost_reason` إلزامي (يُتحقق منه في الكود).
- **مرحلة خط البيع**: لا يمكن حذفها إن كانت مرتبطة بصفقات (`deletePipelineStage` يتحقق من `count` في `crm_deals`)، ولا يمكن أن تكون `is_won` و`is_lost` معاً (`upsertPipelineStage`).
- **نشاط**: يُنشأ مرتبطاً بأحد الكيانات الأربعة إلزامياً (`entity_kind` + معرّف مطابق)، ويُكمَل عبر `completeActivity` بتسجيل `completed_at` و`outcome`.

## سجل التدقيق

جميع عمليات الكتابة أعلاه (باستثناء القراءات المذكورة صراحة كـ"لا") تكتب صفاً في `admin_audit_logs` عبر `writeAudit`، ويشمل: `actor_email`، `action`، `entity_type`، `entity_id`، `description`، `before_data`/`after_data` (JSON قبل/بعد عند توفرها)، و`ip`/`user_agent` من الطلب. أسماء `action` تتبع نمط `crm.<entity>.<verb>` (مثل `crm.lead.create`, `crm.deal.move_stage`, `crm.pipeline_stage.delete`, `crm.export`).

## حالات الخطأ

جميع دوال الخادم ترمي `Error` برسائل عربية محدّدة عند: غياب الصلاحية (رسالة موحّدة من `requireStaff`: "لا تملك الصلاحية اللازمة لتنفيذ هذه العملية." أو "ليس لديك وصول إلى لوحة إدارة المنصة."). فشل استعلام قاعدة البيانات ("تعذّر جلب/إنشاء/تحديث/حذف ..."). قواعد عمل محددة مثل:

- حذف مرحلة مرتبطة بصفقات → "لا يمكن حذف مرحلة مرتبطة بصفقات. عطّلها بدلاً من الحذف."
- مرحلة `is_won` و`is_lost` معاً → "لا يمكن أن تكون المرحلة مكسوبة ومفقودة معاً."
- استبعاد عميل محتمل محوَّل → "لا يمكن استبعاد عميل محتمل تم تحويله بالفعل."
- تحويل عميل محتمل محوَّل مسبقاً → "تم تحويل هذا العميل المحتمل مسبقاً."
- تحريك صفقة مغلقة → "لا يمكن تحريك صفقة مغلقة."
- خسارة صفقة بلا سبب → "اذكر سبب خسارة الصفقة."
- إسناد لموظف غير نشط (`assertStaffActive`) → "الموظف المحدد غير متاح للإسناد."
- نشاط بلا سجل مرتبط → "يجب اختيار السجل المرتبط بالنشاط."

## الاعتماد على خدمات خارجية

- **Supabase**: قاعدة البيانات (جداول CRM أعلاه)، عميل Supabase الإداري (`supabaseAdmin`) عبر `admin()`.
- **`requireSupabaseAuth`** (middleware): يوثّق هوية المستخدم (`context.userId`, `context.supabase`) قبل الوصول لأي دالة.
- لا يوجد استدعاء لخدمة بريد أو دفع أو أي API خارجي داخل `crm.functions.ts`.
- `buildCsv` من `src/lib/csv.ts` يُستخدم محلياً لبناء التصدير، دون رفع الملف لأي تخزين خارجي؛ يُعاد كنص `csv` واسم ملف فقط.

## ما تم اختباره فعلياً (فحص كود + Type Check + Build فقط)

- قراءة كاملة لمنطق `crm.functions.ts` (1394 سطراً) والتحقق من أن كل مسار كتابة يمر عبر `requireStaff` بصلاحية مطابقة لاسمها في `admin-permissions.ts`.
- التحقق من تطابق أسماء الأعمدة المستخدمة في الاستعلامات مع تعريفات `types.ts` للجداول الست.
- التحقق من وجود `writeAudit` في كل دالة كتابة فعلية (لم يُعثر على استثناء).
- لم يُشغَّل أي اختبار تلقائي (unit/e2e) أو تشغيل فعلي لقاعدة البيانات ضمن إعداد هذه الوثيقة؛ الاعتماد كان على قراءة الكود ومطابقته بمخطط قاعدة البيانات فقط.

## ما ينتظر E2E

- سيناريو `convertLead` الكامل (مطابقة جهة اتصال/شركة موجودة، إنشاء صفقة، تحديث حالة العميل المحتمل) لم يُختبر ضد قاعدة بيانات حقيقية.
- سلوك `moveDealStage` عند مراحل `is_won`/`is_lost` المتتالية أو التراجع عنها.
- فلاتر `listLeads`/`listActivities` مع `search` وترميز أحرف خاصة (`%`, `,`) — لا يوجد تعقيم صريح لمدخل `search` في `listLeads` (بخلاف `listHrEmployees` في وحدة HR الذي يزيل `%` و`,`).
- تصدير CSV الفعلي عبر الواجهة (تنزيل الملف، ترميز UTF-8 للعربية).
- سلوك الصلاحيات الدقيقة (`crm.assign`, `crm.manage_pipeline`) في واجهات المستخدم الفعلية (إخفاء/إظهار الأزرار) لم يُراجَع هنا ضمن مكوّنات `src/components/admin/crm/*` بعمق كامل.

## القيود المعروفة

- **تحذير**: لم يُعثر على أي دالة كتابة بلا `writeAudit` في `crm.functions.ts` — جميع دوال الإنشاء/التعديل/الحذف/الإسناد/التصدير تستدعي `g.writeAudit`.
- `search` في `listLeads` و`listActivities` يُدرَج مباشرة داخل نص `.or(...ilike...)` دون تعقيم لحرف `%` أو الفاصلة، بخلاف `listHrEmployees` الذي يزيل هذه الأحرف صراحة؛ هذا فرق سلوك بين الوحدتين يستحق المراجعة.
- سياسات RLS في قاعدة البيانات أخشن دقة من صلاحيات دوال الخادم (لا تميّز `crm.assign` أو `crm.manage_pipeline`)، وبما أن التنفيذ الفعلي يمر عبر عميل الخدمة (`admin()`) فإن RLS ليست خط الدفاع العملي الحالي لهذه الوحدة.
- `getCompanyDetail` و`getDealDetail` يتطلبان أيضاً صلاحية `sales_docs.read` لعرض بيانات مرتبطة (على الأرجح عروض/عقود)، وهو اعتماد متقاطع بين وحدتي CRM والعروض والعقود لم يُوثّق في تعريف صلاحية `crm.read` نفسها.
- لا يوجد ترقيم صفحات (pagination) قياسي في تقارير `pipelineSummary`/`sourceReport` — تُجلب كل الصفقات/العملاء المحتملين دفعة واحدة، ما قد يشكّل قيداً على الأداء مع نمو البيانات.

## ما هو مؤجل بالتصميم

- لا يوجد أي وصول لبيانات المكاتب القانونية (قضايا/مستندات/عملاء المكاتب) من وحدة CRM؛ هذا مؤجل بالتصميم عمداً حسب الملاحظة الصريحة في `admin-permissions.ts` بشأن الخصوصية.
- لا توجد أتمتة تسويقية (حملات، تسجيل عبر الويب) مدمجة مباشرة داخل `crm.functions.ts`؛ الحقول مثل `utm` تُملأ يدوياً أو من مصدر خارجي غير موثّق هنا (تقاطع محتمل مع وحدة `marketing.*` المنفصلة في `admin-permissions.ts`).
