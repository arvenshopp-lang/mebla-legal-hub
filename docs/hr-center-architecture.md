# معمارية مركز الموارد البشرية (HR)

## الهدف والنطاق

وحدة HR ضمن لوحة إدارة المنصة تُدير سجل موظفي منصة مِهلة نفسها (الفريق الداخلي): بياناتهم الوظيفية، الأقسام، تسلسل الإدارة، مستنداتهم الوظيفية، وربطهم بحسابات `platform_staff`. الوصف داخل الكود صريح: **"لا علاقة لها ببيانات مكاتب العملاء أو قضاياهم"** (تعليق في `hr.functions.ts` وفي وصف الصفحة `hr.tsx`).

جميع العمليات تمر عبر دوال خادم في `src/lib/hr.functions.ts`، باستخدام عميل Supabase الإداري (`admin()`)، بعد التحقق من صلاحية `hr.*` عبر `requireStaff`. الأنواع والتسميات المشتركة في `src/lib/hr.shared.ts`.

## المسارات

- `src/routes/mehla-admin/hr.tsx`: صفحة واحدة (`Route: /mehla-admin/hr`) بعنوان "مركز الموظفين"، تعرض:
  - بطاقات ملخّص (إجمالي/نشطون/تحت الملاحظة أو موقوفون/منتهية خدمتهم) على أساس الصفحة الحالية المعروضة فقط.
  - جدول موظفين مع بحث وفلاتر (قسم، حالة توظيف، نوع عقد) وترقيم صفحات.
  - زر "موظف جديد" يظهر فقط عند `can("hr.manage")`.
  - عمود إجراءات: "المستندات" يظهر عند `can("hr.documents.read")`، و"تعديل" يظهر عند `can("hr.manage")`.
- المكوّنات: `src/components/admin/hr/employee-form-modal.tsx` (نموذج إنشاء/تعديل موظف)، `src/components/admin/hr/employee-documents-modal.tsx` (إدارة مستندات الموظف).
- لا يوجد فحص صلاحية `hr.read` على مستوى الصفحة نفسها في `hr.tsx` (بخلاف صفحة CRM التي تتحقق من `crm.read` وتعرض رسالة رفض)؛ الاعتماد الفعلي على منع الوصول هو فشل استدعاءات `listHrEmployees`/`listHrDepartments` من الخادم عند غياب `hr.read`.

## الجداول والعلاقات

### `hr_employees`

| العمود                  | النوع                                      |
| ----------------------- | ------------------------------------------ |
| id                      | uuid                                       |
| full_name               | text                                       |
| email                   | text                                       |
| phone                   | text?                                      |
| job_title               | text?                                      |
| department_id           | uuid? → platform_departments.id            |
| manager_employee_id     | uuid? → hr_employees.id (تسلسل إداري ذاتي) |
| staff_id                | uuid? → platform_staff.id                  |
| user_id                 | uuid?                                      |
| employment_status       | enum `hr_employment_status`                |
| employment_type         | enum `hr_employment_type`                  |
| work_location           | text?                                      |
| joined_at               | date?                                      |
| ended_at                | date?                                      |
| notes                   | text?                                      |
| created_by / updated_by | uuid?                                      |
| created_at / updated_at | timestamptz                                |

### `hr_documents`

| العمود                  | النوع                  |
| ----------------------- | ---------------------- |
| id                      | uuid                   |
| employee_id             | uuid → hr_employees.id |
| kind                    | text                   |
| title                   | text                   |
| storage_path            | text?                  |
| issued_on               | date?                  |
| expires_on              | date?                  |
| notes                   | text?                  |
| uploaded_by             | uuid?                  |
| created_at / updated_at | timestamptz            |

**قيم التعداد** (من `hr.shared.ts`):

- `employment_status`: `active | probation | on_notice | suspended | terminated | resigned`
- `employment_type`: `full_time | part_time | contract | intern | vendor`

**العلاقات**: `hr_employees.department_id → platform_departments`, `hr_employees.manager_employee_id → hr_employees` (ذاتية، تُفحص لمنع الحلقات)، `hr_employees.staff_id → platform_staff` (اختياري، لربط الموظف بحساب دخول له صلاحيات RBAC)، `hr_documents.employee_id → hr_employees`.

## دوال الخادم

| الدالة                      | الصلاحية المطلوبة   | Audit                         |
| --------------------------- | ------------------- | ----------------------------- |
| `listHrEmployees`           | `hr.read`           | لا (قراءة)                    |
| `listHrDepartments`         | `hr.read`           | لا                            |
| `listUnlinkedPlatformStaff` | `hr.read`           | لا                            |
| `getHrEmployee`             | `hr.read`           | لا                            |
| `createHrEmployee`          | `hr.manage`         | نعم (`hr.employee.create`)    |
| `updateHrEmployee`          | `hr.manage`         | نعم (`hr.employee.update`)    |
| `terminateHrEmployee`       | `hr.manage`         | نعم (`hr.employee.terminate`) |
| `listHrDocuments`           | `hr.documents.read` | لا                            |
| `createHrDocument`          | `hr.manage`         | نعم (`hr.document.create`)    |
| `deleteHrDocument`          | `hr.manage`         | نعم (`hr.document.delete`)    |
| `exportHrEmployees`         | `hr.read`           | لا                            |

## الصلاحيات

الصلاحيات المعرّفة فعلياً في `src/lib/admin-permissions.ts` ضمن مجموعة «الموارد البشرية»:

- `hr.read` — مشاهدة سجل الموظفين وأقسامهم ومدرائهم (تشمل أيضاً التصدير `exportHrEmployees`).
- `hr.manage` — إضافة وتعديل بيانات الموظفين ومستنداتهم الوظيفية (تشمل الإنشاء، التعديل، إنهاء الخدمة، وإضافة/حذف المستندات).
- `hr.documents.read` — الاطلاع على العقود والمستندات الوظيفية (منفصلة عن `hr.manage`؛ القراءة فقط).

ملاحظة: لا توجد صلاحية `hr.documents.manage` منفصلة — كتابة المستندات (`createHrDocument`, `deleteHrDocument`) تتطلب `hr.manage` وليس `hr.documents.read`.

## RLS

مفعّلة على `hr_employees` و`hr_documents` (migration `20260805184426`) عبر حلقة توليد سياسات موحّدة بحسب زوج `(read_perm, write_perm)`:

- `hr_employees`: قراءة = `hr.read`، كتابة (إدراج/تعديل/حذف) = `hr.manage`.
- `hr_documents`: قراءة = `hr.documents.read`، كتابة (إدراج/تعديل/حذف) = `hr.manage`.

آلية الفحص: `private.has_platform_permission(auth.uid(), <perm>)` على `SELECT`/`INSERT`/`UPDATE`/`DELETE`. كما في CRM، التنفيذ الفعلي من دوال الخادم يمر عبر عميل الخدمة (`admin()`) الذي يتجاوز RLS، وتُعتبر هذه السياسات خط دفاع ثانٍ متوافق منطقياً مع فحوصات `requireStaff` في الكود (نفس أسماء الصلاحيات لكل عملية).

## دورة الحياة

- **إنشاء موظف** (`createHrEmployee`): يرفض التكرار إن وُجد بريد إلكتروني مطابق مسبقاً في `hr_employees`. لا يفرض ربطاً بـ`staff_id` (اختياري).
- **تعديل موظف** (`updateHrEmployee`): يرفض تكرار البريد الإلكتروني لموظف آخر، ويستدعي `assertNoManagerCycle` لمنع تعيين مدير يُنشئ حلقة في تسلسل الإدارة (حتى 50 مستوى فحص).
- **إنهاء خدمة** (`terminateHrEmployee`): يحدّث `employment_status = "terminated"`, `ended_at`, ويُلحق سبب الإنهاء بنص `notes` الموجود (بدلاً من استبداله) بصيغة `"[إنهاء خدمة <تاريخ>] <سبب>"`. لا توجد حالة عكسية (إعادة تفعيل) موثّقة في الكود المقروء.
- **المستندات**: تُضاف (`createHrDocument`) وتُحذف (`deleteHrDocument`) بشكل مستقل لكل موظف؛ لا يوجد تعديل (`update`) لمستند موجود في الدوال المقروءة — فقط إنشاء وحذف.
- **الربط بـ platform_staff**: `listUnlinkedPlatformStaff` تُستخدم لعرض حسابات `platform_staff` غير المرتبطة بعد بسجل موظف HR، لتمكين ربطها عبر `staff_id` دون إنشاء حساب مزدوج.
- **بيانات إضافية عند العرض** (`getHrEmployee`): تُدمج بيانات RBAC (`role`, `permissions` من `platform_staff` + `platform_roles`)، جلسات الجهاز من `platform_staff_sessions`، وآخر 50 سجلاً من `admin_audit_logs` حيث `actor_email = employee.email` — هذا ربط ضمني عبر تطابق البريد الإلكتروني وليس مفتاحاً خارجياً رسمياً.

## سجل التدقيق

عمليات الكتابة (`createHrEmployee`, `updateHrEmployee`, `terminateHrEmployee`, `createHrDocument`, `deleteHrDocument`) تكتب إلى `admin_audit_logs` عبر `writeAudit` بنفس بنية CRM (`actor_email`, `action`, `entity_type`, `entity_id`, `description`, `before_data`/`after_data`, `ip`, `user_agent`). أسماء `action`: `hr.employee.create`, `hr.employee.update`, `hr.employee.terminate`, `hr.document.create`, `hr.document.delete`.

**ملاحظة دقة**: `updateHrEmployee` يسجّل في `before` فقط حقولاً محدودة (`full_name`, `email`, `department_id`) وليس الصف الكامل قبل التعديل، بخلاف `createHrDocument` الذي لا يسجّل `before`/`after` إطلاقاً (فقط `description`).

## حالات الخطأ

- غياب الصلاحية → رسائل موحّدة من `requireStaff` ("لا تملك الصلاحية اللازمة لتنفيذ هذه العملية." / "ليس لديك وصول إلى لوحة إدارة المنصة.").
- فشل استعلام → "تعذّر جلب قائمة الموظفين." / "تعذّر إنشاء سجل الموظف." / "تعذّر تحديث بيانات الموظف." / "تعذّر تسجيل إنهاء الخدمة." / "تعذّر إضافة المستند." / "تعذّر حذف المستند."
- الموظف غير موجود → "الموظف غير موجود." (في `getHrEmployee`, `updateHrEmployee`, `terminateHrEmployee`)
- تكرار البريد الإلكتروني → "يوجد موظف مسجّل بهذا البريد الإلكتروني مسبقاً." (إنشاء) / "يوجد موظف آخر مسجّل بهذا البريد الإلكتروني." (تعديل)
- حلقة في تسلسل الإدارة → "لا يمكن أن يكون الموظف مديره المباشر." / "هذا التعيين يُنشئ حلقة في تسلسل الإدارة."
- المستند غير موجود → "المستند غير موجود."

## الاعتماد على خدمات خارجية

- **Supabase**: قاعدة البيانات (`hr_employees`, `hr_documents`, `platform_departments`, `platform_staff`, `platform_roles`, `platform_staff_sessions`, `admin_audit_logs`)، وعميل الخدمة الإداري عبر `admin()`.
- **`requireSupabaseAuth`** (middleware): توثيق هوية المستدعي.
- `hr_documents.storage_path` يُخزَّن كنص فقط في قاعدة البيانات — لا يوجد استدعاء فعلي لواجهة تخزين Supabase Storage (رفع/تنزيل ملفات) داخل `hr.functions.ts` المقروء؛ إدارة الملف الفعلي (إن وُجدت) تتم على ما يبدو خارج هذه الدوال أو في مكوّن الواجهة `employee-documents-modal.tsx`.
- لا يوجد استدعاء لخدمة بريد إلكتروني أو أي API خارجي داخل `hr.functions.ts`.

## ما تم اختباره فعلياً (فحص كود + Type Check + Build فقط)

- قراءة كاملة لـ `hr.functions.ts` (434 سطراً) والتحقق من تطابق كل صلاحية مُستخدمة مع تعريفها في `admin-permissions.ts` وسياسات RLS في migration `20260805184426`.
- التحقق من تطابق أعمدة `hr_employees` و`hr_documents` المُستخدمة في الاستعلامات مع `types.ts`.
- التحقق من استدعاء `writeAudit` في كل دالة كتابة.
- لم يُشغَّل أي اختبار تلقائي أو استدعاء فعلي لقاعدة بيانات حية ضمن إعداد هذه الوثيقة.

## ما ينتظر E2E

- سلوك `assertNoManagerCycle` عند تسلسلات إدارة عميقة (حتى الحد الأقصى 50 مستوى) وسيناريوهات حلقة حقيقية.
- سيناريو الربط الكامل بين `hr_employees.staff_id` و`platform_staff`، وتأثيره على عرض `rbacRole`/`permissions` في `getHrEmployee`.
- ربط سجل التدقيق بالموظف عبر تطابق `actor_email` (`getHrEmployee`) لم يُختبر لحالات تعدد الحسابات بنفس البريد أو تغييره.
- رفع/تنزيل مستندات فعلية (لم يُعثر على منطق تخزين ملفات داخل `hr.functions.ts` نفسه، يحتاج تتبع في مكوّن الواجهة والتحقق مع فريق التخزين).
- سلوك واجهة `hr.tsx` عند غياب `hr.read` كلياً (لا يوجد حارس صفحة صريح كما في CRM) — يحتاج تحققاً يدوياً/E2E من رسالة الخطأ الفعلية المعروضة للمستخدم.

## القيود المعروفة

- **تحذير**: لم يُعثر على أي دالة كتابة بلا `writeAudit` في `hr.functions.ts` — جميع دوال الإنشاء/التعديل/الإنهاء/إضافة وحذف المستندات تستدعي `g.writeAudit`. لكن تفاصيل `before`/`after` غير متّسقة العمق بين الدوال (`updateHrEmployee` يسجّل حقولاً جزئية فقط، `createHrDocument` لا يسجّل بيانات قبل/بعد إطلاقاً).
- صفحة `hr.tsx` لا تتحقق من `hr.read` على مستوى الواجهة (خلافاً لصفحة CRM)، وتعتمد كلياً على فشل دوال الخادم لإخفاء البيانات — قد يظهر إطار الصفحة والفلاتر لمستخدم بلا صلاحية قبل ظهور رسالة الخطأ.
- لا توجد حالة "إعادة تفعيل" (reactivate) لموظف منتهي الخدمة في الدوال المقروءة؛ التعديل عبر `updateHrEmployee` العام يسمح تقنياً بتغيير `employment_status` لكن دون تدفق عمل مخصص كما في `terminateHrEmployee`.
- ربط سجل التدقيق بالموظف في `getHrEmployee` يعتمد على مطابقة نصية للبريد الإلكتروني (`actor_email = row.email`) وليس مفتاحاً خارجياً، ما يجعله عرضة لعدم الدقة إذا تغيّر بريد الموظف تاريخياً.
- `hr_documents.storage_path` نص حر دون تحقق من مساره الفعلي أو وجود الملف في التخزين ضمن الدوال المقروءة.

## ما هو مؤجل بالتصميم

- لا يوجد أي وصول أو تقاطع مع بيانات مكاتب العملاء أو قضاياهم من وحدة HR؛ هذا مؤجل بالتصميم عمداً وموثّق صراحة في تعليقات الكود ووصف الصفحة.
- لا يوجد تعديل مباشر لمستند موجود (تحديث `hr_documents`) — فقط إنشاء وحذف؛ إن كان التعديل مطلوباً مستقبلاً فهو غير موجود حالياً.
- لا توجد صلاحية منفصلة لإدارة المستندات (`hr.documents.manage`) تميّزها عن `hr.manage` العامة — القرار الحالي هو دمج كتابة المستندات ضمن صلاحية إدارة الموظفين الشاملة.
