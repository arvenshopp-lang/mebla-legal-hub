# MEHLA-SALES-002 — قرار دلالات حذف المسودة (تحليل فقط، بلا تنفيذ)

الحالة: ROOT_CAUSE_CONFIRMED — `sales_document_events` جدول Append-Only محمي بـ `sales_events_no_delete → deny_hard_delete()`، وFK من الأحداث إلى `sales_documents` بـ `ON DELETE CASCADE`، فيصطدم الحذف الصلب دائماً بـ P0001.

## ما تم التحقق منه فعلياً في هذه الجولة

- `sales_documents` لا تحتوي أي عمود: `deleted_at` / `archived_at` / `is_hidden`. (فحص information_schema — 45 عموداً، لا شيء منها للحذف الناعم.)
- `sales_doc_status` يشمل: draft, pending_approval, approved, sent, viewed, accepted, rejected, expired, cancelled, active, terminated — لا حالة تعني "مسودة تخلّص منها المستخدم".
- `STATUS_TRANSITIONS` في `src/lib/sales-docs.shared.ts:120`: **draft → cancelled مسموح اليوم**.
- `recordDecision` في `src/lib/sales-docs.server.ts:544` يقبل `cancelled` ويكتب `decided_at` و`decision_note` وحدث `decision_cancelled`، بصلاحية `sales_docs.decide` — أي أن مساراً خادمياً جاهزاً موجود بلا أي Migration.
- `sales_documents_immutability_guard` لا يمنع الانتقال إلى cancelled؛ يمنع فقط تغيير المبالغ/العملة/النوع/الرقم بعد الحالات النهائية. لذا الانتقال آمن بنيوياً.
- الترقيم يُمنح فقط عند الإرسال (`sales-docs.server.ts:484`)، فالمسودة `number = NULL` ولا تستهلك تسلسلاً مالياً.
- لا تقارير مالية تقرأ `sales_documents`؛ الاستخدام الخارجي الوحيد في `src/lib/crm.functions.ts:666,1112` (قائمة مستندات الشركة/الفرصة) وقائمة `/mehla-admin/sales` بفلتر حالة اختياري — أي إخفاء يجب أن يكون في هذه المواضع الثلاثة.
- الأحداث تبقى سليمة في كل الحالات لأن لا شيء يُحذف.

## OPTION_A_HARD_DELETE

- MIGRATION_REQUIRED: نعم (دالة SECURITY DEFINER + تعديل منطق `deny_hard_delete` أو استثناء بمفتاح جلسة).
- SECURITY_RISK: مرتفع — أي استثناء داخل حارس Append-Only يفتح مساراً قابلاً لإعادة الاستخدام على جداول تدقيق أخرى؛ ويتطلب ضوابط: draft-only، document-specific، transaction-scoped، server-controlled، authorization-checked، audited، غير قابل للنداء من أدوار العميل.
- AUDITABILITY: أدنى الخيارات — يُفقد الأثر الأصلي ويُستبدل بلقطة (snapshot) في `admin_audit_logs`، أي تدقيق مشتق لا أصلي.
- COMPLEXITY: مرتفع؛ Rollback معقّد لأن الصفوف المحذوفة غير قابلة للاستعادة.
- RECOMMENDATION: مرفوض الآن. وحالته على أي حال: IMPLEMENTATION_BLOCKED_BY_RECOVERY_GATE.

## OPTION_B_SOFT_DELETE_OR_ARCHIVE

- CURRENT_SCHEMA_SUPPORT: لا يوجد عمود حذف ناعم/أرشفة.
- CURRENT_STATUS_SUPPORT: جزئي — `cancelled` قابل للوصول من `draft` عبر مسار خادمي قائم.
- BUSINESS_SEMANTIC_COMPATIBILITY: غير مطابق تماماً. `cancelled` في المنصة تعني "إلغاء تجاري لمستند صدر/أُرسل" (مقترن بـ decided_at وdecision_note وأحداث قرار)، وليس "مسودة أزالها المستخدم". ويمكن تمييز الحالتين استنتاجياً بـ `number IS NULL` و`from_status='draft'` في الحدث، لكن هذا تمييز مشتق لا حالة صريحة.
- MIGRATION_REQUIRED: لا (للمسار الانتقالي)، نعم (للحالة الصريحة الصحيحة).
- AUDITABILITY: الأفضل — لا حذف، والسلسلة كاملة ونهائية.
- USER_EXPERIENCE: مقبول — تختفي المسودة من قائمة العمل الافتراضية وتبقى قابلة للعرض بفلتر صريح؛ وقابلة للاستعادة فقط إن أُضيف انتقال عكسي (غير موجود اليوم: `cancelled: []`).
- RECOMMENDATION: يُعتمد كمسار انتقالي فقط، مع وسم صريح للحدث، وبدون إعادة تعريف معنى cancelled.

## RECOMMENDED_MEHLA_MODEL

**NEEDS_NEW_STATE** (الهدف النهائي) — الصحيح دلالياً هو حالة/علامة صريحة مثل `discarded` (أو `draft_discarded_at`) تعني: مسودة لم تُرسل، أزالها المستخدم، لا أثر مالي، لا رقم، قابلة للاستعادة اختيارياً. السبب: الحفاظ على Append-Only بلا استثناءات، وعدم تلويث معنى `cancelled` التجاري، وعدم فقدان أي تدقيق. وهذا يتطلب Migration ⇒ محجوب حالياً.

## المسار الآمن بلا Migration (تقييم، بلا تنفيذ)

موجود ولكنه انتقالي لا نهائي: استخدام `draft → cancelled` عبر المسار الخادمي القائم، مع حدث موسوم بنية "إزالة مسودة"، وإخفاء المسودات الملغاة (`status='cancelled' AND number IS NULL`) من القوائم الافتراضية مع فلتر صريح لعرضها.

EXACT_FILES (المواضع الدقيقة، للمراجعة فقط):
1. `src/lib/sales-docs.server.ts` — استبدال `deleteDraft` (سطر ~350-375) بمسار "discardDraft" يستدعي نفس منطق `recordDecision('cancelled')` مع `decision_note` ثابت، ويكتب حدثاً باسم مميّز (`draft_discarded`) بدل `decision_cancelled`؛ وإضافة تعيين واضح لـ P0001 في `dbReason` (تحسين رسالة فقط، ليس إصلاحاً جذرياً).
2. `src/lib/sales-docs.functions.ts` — المسار ~95-115: الإبقاء على فحص `sales_docs.delete` كصلاحية الإزالة بدل `sales_docs.decide` حتى لا تُوسّع صلاحية القرار التجاري.
3. `src/routes/mehla-admin/sales/index.tsx` — استبعاد المسودات المُزالة من القائمة الافتراضية وإتاحة فلتر "مسودات مُزالة".
4. `src/routes/mehla-admin/sales/$id.tsx` — نص الزر ورسالة التأكيد.
5. `src/lib/crm.functions.ts:666,1112` — استبعاد نفس الصفوف من مستندات الشركة/الفرصة.

MINIMAL_FIX: نقل زر الحذف إلى مسار إزالة غير مدمّرة + إخفاء القوائم + تعيين رسالة P0001. لا Migration، لا Trigger، لا SECURITY DEFINER، لا تعديل بيانات.

## نص الزر الموصى به

"إلغاء المسودة" فقط إن اعتُمد المسار الانتقالي (لأن الحالة المخزَّنة فعلاً هي cancelled — والصدق مع المستخدم مطلوب). النص المستهدف بعد إضافة الحالة الصريحة: "أرشفة المسودة". النص "حذف المسودة" غير صحيح دلالياً في كل الأحوال ويجب إزالته لأن الصف لا يُحذف.

## القرار

- الحل النهائي (NEEDS_NEW_STATE) يحتاج Migration ⇒ `MEHLA-SALES-002 = BLOCKED_BY_RECOVERY_GATE`.
- يوجد مسار انتقالي آمن بلا Migration (أعلاه) لم يُنفّذ ولن يُنفّذ إلا بموافقة صريحة منك.
- لم يُعدَّل أي ملف أو بيان أو قاعدة بيانات في هذه الجولة.
