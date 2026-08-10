# سجل أحداث المهام والمهل — `public.work_item_events`

سجل مغلق (Append-only) يوثّق تاريخ إسناد وتواريخ استحقاق وإنجاز المهام والمهل، ويُستخدم كمصدر
حقيقة لمحرك الأداء (Feature 02) وللجدول الزمني في واجهة تفاصيل المهمة.

## 1. الحالة الفعلية المُتحقَّق منها (بتاريخ 2026-08-10)

| البند | القيمة |
| --- | --- |
| Row Level Security | مُفعّل (`relrowsecurity = true`) |
| مالك الجدول | `postgres` |
| صلاحيات `anon` | **لا شيء** (تم `REVOKE ALL` في 2026-08-10) |
| صلاحيات `authenticated` | `SELECT` فقط (لا `INSERT`/`UPDATE`/`DELETE`) |
| صلاحيات `service_role` | كاملة (تُستخدم من الخادم للقراءة الإدارية) |
| سياسات موجودة | `work_item_events_select_managers` — قراءة فقط (`SELECT`) لـ `authenticated` |
| سياسات `INSERT` / `UPDATE` / `DELETE` | **لا توجد — ممنوعة تماماً** |

شرط سياسة القراءة:

```sql
private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[])
```

> ملاحظة تاريخية مهمة: قبل 2026-08-10 كان الجدول يمنح `anon` و`authenticated` صلاحيات كاملة
> (`arwdDxtm`) وكان الحجب معتمداً على غياب سياسات الكتابة فقط. تم إلغاء تلك المنح لتطبيق
> Least Privilege. عند فحص المنح لا تعتمد على `information_schema.role_table_grants` من دور
> محدود (يُخفي منح الأدوار الأخرى) — استخدم `pg_class.relacl` أو `has_table_privilege`.

## 2. لماذا لا يمكن لأي مستخدم الكتابة مباشرة

الحجب مبني على طبقتين مستقلتين (Defense in Depth):

1. **غياب GRANT للكتابة**: Data API (PostgREST) يعمل بأدوار `anon` / `authenticated`، ولا تملك أي
   منها `INSERT` أو `UPDATE` أو `DELETE`، و`anon` بلا أي صلاحية إطلاقاً — فالطلب المباشر يُرفض
   بخطأ صلاحية قبل تقييم RLS.
2. **غياب سياسات الكتابة**: حتى لو مُنحت صلاحية بالخطأ مستقبلاً، لا توجد سياسة `WITH CHECK` لأي
   عملية كتابة، وRLS مُفعّل — فالنتيجة رفض الصف.

> قاعدة صيانة: يُمنع إضافة `GRANT INSERT/UPDATE/DELETE ON public.work_item_events` لأي دور تطبيقي،
> ويُمنع إنشاء سياسة `FOR INSERT` أو `FOR UPDATE` أو `FOR DELETE` على هذا الجدول.

## 3. مسار التسجيل الشرعي الوحيد: `SECURITY DEFINER`

الكتابة تحدث حصراً داخل دالة المشغّل:

- `private.work_item_capture_events()` — `SECURITY DEFINER`،
  `SET search_path = private, public, pg_temp`، مملوكة لـ `postgres` (مالك الجدول) لذلك تتجاوز RLS.
- مربوطة بمشغّلين:
  - `tasks_capture_events` — `AFTER INSERT OR UPDATE OR DELETE ON public.tasks`
  - `deadlines_capture_events` — `AFTER INSERT OR UPDATE OR DELETE ON public.deadlines`

الأحداث تُشتق من فرق الصفوف (`OLD` / `NEW`) ولا تُقرأ من مدخلات العميل: `created`, `assigned`,
`due_changed`, `completed`, `reopened`, `cancelled`, `deleted`. الفاعل يُقرأ من `auth.uid()` فقط،
فلا يمكن للمستخدم انتحال فاعل آخر.

### مناعة السجل

لا توجد سياسات `UPDATE`/`DELETE`، ويوجد إضافةً إلى ذلك حرس على مستوى القاعدة يمنع التعديل والحذف
حتى للأدوار الإدارية، فالسجل Append-only فعلياً.

### عدم إفشال عملية المستخدم

منطق التسجيل داخل الدالة مُغلَّف بـ `BEGIN … EXCEPTION WHEN OTHERS` — أي فشل في التقاط الحدث
**لا يُفشل** تحديث المهمة أو المهلة، بل يُسجَّل عطل في `public.system_failures` بمرجع `WIE-…`
(`surface = work_items`, `action = work_item_events.capture`) مع `SQLSTATE` ونوع العملية ومعرّف
العنصر، مع `RAISE WARNING` في سجلات القاعدة.

## 4. مسار القراءة في التطبيق

لأن الجدول بلا `GRANT SELECT` لأي دور تطبيقي، القراءة لا تمر عبر Data API:

- `src/lib/work-items/timeline.server.ts` يتحقق أولاً من صلاحية المستخدم على المهمة/المهلة عبر
  عميل RLS الخاص بالمستخدم (`requireSupabaseAuth`)، ثم يقرأ الأحداث بـ `supabaseAdmin` ويُثري
  الأسماء من `profiles`.
- `src/lib/work-items/timeline.functions.ts` يعرّف دالة الخادم المستدعاة من الواجهة.
- `src/components/work-items/work-item-timeline.tsx` يعرض الجدول الزمني بتوقيت الرياض.

سياسة `work_item_events_select_managers` تحصر القراءة المباشرة عبر Data API على `owner`/`admin`
داخل مكتبهم فقط؛ بقية الأدوار تحصل على صفر صفوف.

### حرس آلي دائم

فحص `work_item_events_writable` في `scripts/security-guardrails.sql` (`bun run security:db`) يفشل
فوراً إذا مُنح `anon` أو `authenticated` أي صلاحية كتابة، أو أُنشئت أي سياسة
`INSERT`/`UPDATE`/`DELETE`/`ALL` على الجدول.

## 5. تغطية الاختبارات

`scripts/e2e/work_item_events.e2e.ts` (`bun run work-items:e2e`) — 30 حالة تتحقق من:

- نجاح إنشاء/تعديل/إنجاز/إعادة فتح/حذف المهام والمهل بحساب محامٍ عادي، وتسجيل الحدث المقابل.
- رفض الكتابة المباشرة في السجل لأدوار `lawyer` و`legal_assistant` و`viewer` ومستخدم خارج المكتب.
- رفض القراءة المباشرة لنفس الأدوار.
- عدم قابلية السجل للتعديل أو الحذف حتى لمالك المكتب.

النتيجة الأخيرة: **30 PASS / 0 FAIL**.

## 6. قائمة تحقق قبل أي تعديل على هذا الجدول

1. لا `GRANT` كتابة لأي دور تطبيقي، ولا سياسة كتابة جديدة.
2. أي حدث جديد يُضاف داخل `private.work_item_capture_events()` فقط، ومشتق من `OLD`/`NEW`.
3. الحفاظ على `SECURITY DEFINER` + `SET search_path` عند أي `CREATE OR REPLACE`.
4. الحفاظ على غلاف الاستثناء وتسجيل العطل في `system_failures`.
5. تشغيل `bun run work-items:e2e` والتأكد من `FAIL = 0`.