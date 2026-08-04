# مركز الدعم (Support Center) — وثيقة معمارية

الحالة: **تحليل ومعمارية معتمدة قبل التنفيذ.**

## 1. البنية القائمة اليوم (تحليل فعلي)

| المكوّن | الحالة الفعلية | الفجوة |
| --- | --- | --- |
| `support_tickets` | `reference`, `user_id`, `organization_id`, `subject`, `description`, `category`, `priority`, `status`, `assigned_to`, `last_reply_at`, `closed_at`, `rating`, `rating_comment`, `rated_at`, `rated_staff_id` | لا قناة، لا SLA، لا تصعيد، لا دمج، لا وسوم، لا فريق، لا ربط اشتراك، لا خط زمني موحّد. |
| `support_ticket_messages` | `ticket_id`, `author_id`, `author_name`, `is_staff`, `body`, `attachments` | لا ملاحظات داخلية مفصولة، ولا ربط برسالة بريد. |
| `support_tickets_guard` / `support_ticket_messages_guard` | Triggers تفرض ملكية الكاتب وتحدّث `last_reply_at`. | تبقى كما هي ويُبنى عليها. |
| الصلاحيات | `tickets.view`, `tickets.reply`, `tickets.assign` | تحتاج التوسّع إلى 12 صلاحية دقيقة. |
| الواجهات | `/mehla-admin/support` للمنصة، `/support` للمكتب | تبقى وتُوسّع، لا تُعاد من الصفر. |
| CSAT | حقول التقييم موجودة وتُصدَّر مع تحييد صِيَغ CSV | جاهز. |

**قرار:** توسيع تدريجي (`ALTER`) للجدولين القائمين + جداول مساندة جديدة. لا إعادة بناء ولا فقدان بيانات.

## 2. نموذج البيانات المقترح

| الجدول | الغرض |
| --- | --- |
| `support_tickets` (توسيع) | `ticket_number` (تسلسل مقروء عبر `next_financial_number`-نمط)، `channel` (`email` / `web_form` / `manual` / `whatsapp` / `chat`)، `subscription_id`، `team_id`، `sla_policy_id`، `first_response_at`، `resolved_at`، `due_first_response_at`، `due_resolution_at`، `sla_state`، `paused_at`، `paused_total_seconds`، `escalation_level`، `merged_into_id`، `reopened_count`، `source_email_thread_id`، `kb_article_ids`. |
| `support_teams` / `support_team_members` | الفرق ومسارات التوجيه. |
| `support_categories` | التصنيفات مع الأولوية الافتراضية وسياسة SLA. |
| `support_tags` / `support_ticket_tags` | الوسوم. |
| `support_ticket_events` | الخط الزمني الموحّد: إنشاء، رد، ملاحظة، تعيين، تغيير حالة/أولوية، تصعيد، دمج، تقسيم، إغلاق، إعادة فتح، حدث SLA. غير قابل للتعديل. |
| `support_internal_notes` | ملاحظات داخلية لا تُرسل ولا تظهر للمكتب أبداً. |
| `support_sla_policies` | السياسات (انظر §4). |
| `support_sla_events` | كل تغيير في حالة SLA مع سببه. |
| `support_business_calendars` / `support_holidays` | ساعات وأيام العمل والعطلات بتوقيت الرياض. |
| `support_escalation_rules` | شروط التصعيد وأثره. |

## 3. استيعاب البريد الوارد ⇒ تذكرة

عند وصول رسالة إلى `support@mehlalex.com` (عبر نقطة Webhook موقّعة، وتُختبر بالمحاكاة الآن):

```text
1. تحقّق التوقيع + تحليل الرسالة.
2. مفتاح التفرّد = provider_ref أو Message-ID  → موجود؟ توقّف (منع التكرار).
3. ابحث عن تذكرة عبر: In-Reply-To/References → email_threads.ticket_id
                      ثم رقم التذكرة في الموضوع [MEH-000123]
                      ثم آخر تذكرة مفتوحة لنفس المرسل خلال 72 ساعة.
4. وُجدت → أضف الرسالة إلى الخط الزمني، وأعد الحالة إلى «بانتظار الوكيل»،
             وأوقف Pause احتساب SLA.
   لم توجد → أنشئ تذكرة بقناة email وأولوية التصنيف الافتراضية.
5. التعرّف: البريد → المستخدم → المكتب → الاشتراك النشط (إن وُجد).
6. أطلق قواعد التوجيه (فريق/وكيل) وحساب مواعيد SLA.
```

منع التكرار مضمون بقيد `unique` على `provider_ref` وقيد على `message_id`، لا بمنطق الواجهة.

## 4. نظام SLA الفعلي

- **مصادر السياسة بالترتيب:** الباقة ← الأولوية ← القناة ← التصنيف (الأخص يفوز).
- **التقويم:** ساعات وأيام عمل بتوقيت `Asia/Riyadh` + جدول عطلات؛ كل الحسابات
  «وقت عمل» لا وقتاً مطلقاً، وتُخزَّن جميع الطوابع بـ `timestamptz`.
- **المؤشّرات:** وقت أول رد، وقت الحل.
- **Pause:** الحالة «بانتظار العميل» توقف العدّاد، والتراكم في `paused_total_seconds`.
- **Breach Warning:** عند 75% و90% من المهلة ⇒ حدث + إشعار للفريق.
- **Escalation:** تجاوز المهلة أو أولوية عاجلة أو تجاوز مستوى ⇒ رفع المستوى وإعادة التعيين.
- **السجل:** كل تغيير (تعليق، استئناف، تحذير، تجاوز، تصعيد) في `support_sla_events` مع سببه.
- الحساب خادمي بالكامل؛ الواجهة تعرض النتيجة فقط ولا تحسب مهلاً.

## 5. الصلاحيات (تُفرض خادمياً)

`support.read` · `support.create` · `support.reply` · `support.assign` · `support.escalate` ·
`support.close` · `support.reopen` · `support.merge` · `support.manage_sla` ·
`support.manage_categories` · `support.view_all_offices` · `support.export`

- بدون `support.view_all_offices` يرى الوكيل تذاكره وتذاكر فرقه فقط (فلترة في الاستعلام لا في الواجهة).
- `support.export` يستخدم مُحيّد صِيَغ CSV في `src/lib/csv.ts` إلزامياً.
- الصلاحيات القائمة `tickets.*` تُحفظ للتوافق وتُخطَّط إلى الصلاحيات الجديدة.
- **حدّ الخصوصية:** لا صلاحية دعم تمنح الاطلاع على بيانات المكتب (قضايا، مستندات، عملاء)؛
  الاستثناء الوحيد منحة `support_access_grants` بموافقة المكتب ومدة محددة وسبب مُسجّل.

## 6. الربط بمركز البريد

- الرد على التذكرة يُنشئ رسالة صادرة في صندوق `support@` بنفس `thread_id`.
- كل رسالة بريد مرتبطة بتذكرة تحمل `ticket_id`، وكل تذكرة من بريد تحمل `source_email_thread_id`.
- الملاحظات الداخلية في المركزين لا تدخل أي مسار إرسال، ويُمنع ذلك خادمياً.
- الدمج (Merge) ينقل الرسائل والأحداث إلى التذكرة الهدف ويُبقي مرجعاً للأصل (لا حذف).

## 7. قيود معمارية مُعلنة

1. إنشاء تذكرة من بريد وارد **حقيقي** يحتاج مزوّد بريد وارد؛ حتى ذلك الحين يُختبر المسار
   عبر محاكاة استدعاء نقطة الاستيعاب بحمولة موقّعة.
2. WhatsApp والدردشة معرّفتان كقناتين في النموذج فقط، بلا تنفيذ.
3. قاعدة المعرفة تُربط بالمعرّفات (`kb_article_ids`) ويُبنى محتواها في مرحلة لاحقة.
4. الترقيم المقروء للتذاكر يعتمد تسلسلاً في القاعدة لضمان عدم التكرار تحت التزامن.
5. `noreply@` لا يستقبل ولا يُنشئ تذاكر بأي حال.
