# MEHLA DOCUMENT SECURITY IMPLEMENTATION MASTER PLAN

المرجع المجمّد: V5 FINAL (ARCHITECTURE FROZEN). هذه مرحلة تخطيط تنفيذ فقط — لا Migration ولا Deploy ولا تغيير إنتاج.
كل مرحلة: IMPLEMENT → VERIFY → ATTACK → EVIDENCE → GATE. لا انتقال قبل نجاح البوابة. حالات الضابط: DESIGNED → IMPLEMENTED → UNIT_TESTED → INTEGRATION_TESTED → ADVERSARIAL_TESTED → EVIDENCE_AVAILABLE → READY_FOR_ENFORCEMENT → EXTERNALLY_VALIDATED (لا انتقال تلقائي).

## المراحل S0–S30

### S0 — BASELINE & INVENTORY
- الهدف: جرد كامل ومُعاد اكتشافه من الكود لكل نقاط الرفع/التسليم/المعاينة/الروابط الموقّعة/OCR/AI/الفهرسة/مرفقات البريد/العقود/الدعم/الوسائط العامة/الإصلاح والقديم.
- ملفات مرشحة: `src/lib/documents/intake.{server,functions}.ts`، `src/lib/client-portal.server.ts`، `src/routes/upload.$token.tsx`، `src/routes/api/public/doc.$token.ts`، `src/routes/share.$token.tsx`، `src/lib/secure-view/*`، `src/lib/email/attachments.*`، `src/lib/office-page.server.ts`، `src/routes/api/public/office/media/$.ts`، `src/lib/ocr.server.ts`، `src/lib/document-ai.*`، `src/lib/contracts/*`، `src/components/documents/repair-panel.tsx`.
- DB/Storage/Infra: لا شيء. المخاطر: لا شيء. Rollback: لا شيء.
- اختبارات: سكربت جرد + مقارنة بالجرد المرجعي. هجوم: البحث عن مسار غير مدرَج.
- أدلة: FILE_ENTRYPOINT_INVENTORY، FILE_DELIVERY_INVENTORY، RAW_FILE_PROCESSOR_INVENTORY، PUBLIC_STORAGE_INVENTORY.
- Entry: موافقة. Exit: UNKNOWN_FILE_ENTRYPOINTS = 0.

### S1 — SECURITY DATA MODEL
- الهدف: تصميم الجداول: secure_files, file_scans, file_scan_results, file_security_decisions, file_evidence_attestations, file_release_events, file_lineage, file_security_audit_events, file_security_overrides, file_ioc, security_outbox — بلا Overwrite لتاريخ الفحص، بدعم فحوص/محركات/قرارات متعددة وإعادة تصنيف ونسب.
- DB: جداول جديدة + GRANT صريح + RLS بعزل مستأجر + جداول أمنية مغلقة (service_role فقط). Storage/Infra: لا شيء.
- مخاطر: منخفضة (إضافية). Rollback: إسقاط الجداول الجديدة بلا مساس بالقائم.
- اختبارات: RLS عبر المستأجرين، منع UPDATE على النتائج، فرادة (file, scan, engine). هجوم: قراءة عبر مستأجر، تعديل نتيجة.
- Entry: S0. Exit: مخطط مطبّق ومختبر بلا مسار Overwrite.

### S2 — DATABASE STATE ENFORCEMENT
- الهدف: `approved_security_transition(...)` + Trigger يرفض UPDATE مباشر على عمود الحالة + CAS بعمود version + سحب صلاحية UPDATE من دور التطبيق.
- DB: دالة SECURITY DEFINER + Trigger + REVOKE/GRANT مخصص.
- مخاطر: متوسطة (صلاحيات). Rollback: إسقاط الدالة/الـTrigger وإعادة الصلاحيات.
- اختبارات: مصفوفة الانتقالات المسموحة/الممنوعة + property tests. هجوم: SQL مباشر من دور التطبيق لتنفيذ `state='released'` — يجب أن يفشل.
- Exit: DIRECT_SECURITY_STATE_UPDATE = 0.

### S3 — IMMUTABLE QUARANTINE
- الهدف: مخزن حجر منفصل مع أقوى immutability متاحة (التحقق أولاً من Object Lock/Versioning/منع UPDATE).
- Storage: Bucket حجر خاص، كائن فريد لكل رفع، بلا upsert، هوية حذف/احتفاظ منفصلة.
- مخاطر: متوسطة. Rollback: إبقاء المسار القديم فعالاً (Additive).
- هجوم: overwrite، نفس المفتاح، استبدال متزامن، استبدال متأخر، كتابة عبر مستأجر.
- Exit: QUARANTINE_OBJECT_OVERWRITE_AFTER_UPLOAD = 0.

### S4 — SECURE UPLOAD CAPABILITY
- الهدف: المتصفح → قدرة أحادية → الحجر؛ لا وصول للتخزين النهائي. الرابط المؤقت = إذن رفع فقط.
- ملفات: `intake.functions.ts`، `client-portal.server.ts`، `upload.$token.tsx`.
- DB: جدول حصص/فتحات. مخاطر: متوسطة على تجربة الرفع. Rollback: تبديل علم المسار.
- هجوم: replay، توكن منته، مستأجر خاطئ، عدد ملفات مفرط، حجم مفرط، رفع متزامن مسيء.

### S5 — MOVE RAW BYTE PROCESSING OUT OF MAIN APP
- الهدف: إخراج قراءة/تحليل البايتات من التطبيق (حالياً `verifyUploadedObject` يقرأ البايتات داخل التطبيق).
- ملفات: `intake.server.ts`، `documents/file-signature.ts`، `document-ai`، `ocr.server.ts`، `secure-view/*`.
- Exit: RAW_UNTRUSTED_APP_PROCESSING = 0.

### S6 — HOSTILE PROCESSING ZONE
- الهدف: بنية Zone H: عامل لكل ملف يُدمَّر بعده، بلا شبكة/Metadata/DB/KMS/أسرار/تخزين نهائي.
- Infra: يتطلب بنية سعودية. أدلة: Infrastructure Decision Record (Container vs MicroVM، توفر العزل).

### S7 — RESOURCE GOVERNOR
- حدود لكل عامل (CPU/RAM/Disk/عمليات/FDs/زمن) ولكل ملف (حجم/حجم مفكوك/صفحات/كائنات/أبعاد/نسبة ضغط/تعشيش).
- هجوم: محاكاة Zip/XML/Image bomb، تعليق Parser، PDF ضخم، OOXML تالف. Exit: SINGLE_FILE_PLATFORM_DOS = 0.

### S8 — TYPE & STRUCTURAL ANALYSIS
- MIME مستقل + Magic + امتداد + Polyglot + تحليل PDF/OOXML/صور + تطبيع الأسماء + تقسية ZIP داخلي (symlink/traversal/حدود). أي اختلاف = NO RELEASE؛ مشفّر = UNSCANNABLE.

### S9 — AV ENGINE A / S10 — YARA / S11 — AV ENGINE B
- عمال منفصلون، صور مثبتة Digest، هوية لكل مهمة، قواعد موقّعة ومُصدَّرة، حدّ عمر التواقيع.
- هجوم: EICAR، ماسح معطّل، تواقيع قديمة، Timeout، نتيجة خاطئة، انهيار محرك، تحديث قواعد تالف.
- Exit S11: MULTI_ENGINE_MALWARE_DETECTION = VERIFIED (حالياً HIGH GAP).

### S12 — DYNAMIC DETONATION
- تفجير للمصادر الخارجية (PDF/DOCX/XLSX): بيئة واحدة لكل ملف، MicroVM إن كانت القرار المعتمد، شبكة وهمية/Sinkhole، مراقبة عمليات/شل/شبكة/DNS/كتابة. إن لم تتوفر MicroVM: HIGH_RISK_DYNAMIC_RELEASE = DISABLED بلا تخفيض صامت.

### S13 — CDR & TRANSFORMATION
- كل مشتق: كائن جديد + SHA-256 + نسب + إعادة تحقق بنيوي + AV + YARA؛ الصور: فك/تجريد/إعادة ترميز/إعادة فحص. Exit: TRANSFORM_OUTPUT_WITHOUT_RESCAN = 0.

### S14 — SAFE PREVIEW
- Origin معزول بلا Cookies جلسة، CSP صارمة، nosniff، Content-Type صارم، CORS/CORP أدنى؛ المعاينة العادية لا تفتح الأصل. ملفات: `secure-view/*`، `security-headers.server.ts`.

### S15 — DECISION ENGINE
- لا يقرأ بايتات؛ يطبّق جدول القرار المهيمن بالرفض؛ Property-based tests على كل تركيبة نتائج.

### S16 — INDEPENDENT EVIDENCE VERIFIER
- هوية ومفتاح KMS منفصلان؛ يعيد حساب السياسة من الأدلة. هجوم: Decision يرسل false-clean → رفض؛ Verifier يوافق زوراً مع رفض Decision → رفض.
- Exit: SINGLE_CONTROL_PLANE_COMPROMISE_RELEASE = 0.

### S17 — RELEASE 2-OF-2
- الإفراج يتطلب Decision Token + Evidence Attestation متطابقين على الملف/المستأجر/البصمة/السياسة/حزمة الأدلة/الغرض؛ رموز قصيرة الأجل، audience-bound، jti، مضادة لإعادة الاستخدام.

### S18 — OBJECT-SCOPED DELIVERY
- قدرة قراءة لملف واحد/مستخدم واحد/غرض واحد/TTL قصير. هجوم: طلب ملف عشوائي، مستأجر آخر، ملف محجوز، خزنة الأدلة، ملف خبيث — كلها مرفوضة. Exit: RELEASE_SERVICE_BUCKET_WIDE_ACCESS = 0.

### S19 — STREAMING PROXY
- بلا روابط تخزين مباشرة؛ حساب منفصل، حدود نطاق/تزامن/زمن، سياسة Range، بلا تخزين كامل بالذاكرة. Exit: DIRECT_STORAGE_DOCUMENT_DELIVERY = 0.

### S20 — AUDIT INTEGRITY
- سجل Append-only + سلسلة بصمات + ملخص موقّع بـ KMS + نسخة WORM إن توفرت. هجوم: تعديل/حذف/تسلسل ناقص. Exit: AUDIT_TAMPERING_DETECTABLE = YES.

### S21 — IOC & RETROACTIVE BLOCKING
- قائمة بصمات خبيثة، بحث IOC، إعادة فحص مستمرة؛ Clean→Malicious يحجب التسليم والمعاينة وAI/OCR والمشاركة، يفتح حادثاً، ويحدد التنزيلات السابقة.

### S22 — LEGACY MIGRATION
- جرد → بصمات → فحص → تصنيف → إعادة فحص. Exit: LEGACY_UNSCANNED_ACCESS_AFTER_ENFORCEMENT = 0.

### S23 — PUBLIC MEDIA
- لا draft → public: فحص، إعادة بناء، فحص المخرجات، إفراج، ثم النشر؛ واختبار إعادة التصنيف الرجعية مع تنظيف CDN. Exit: PUBLIC_MEDIA_WITHOUT_RELEASE = 0.

### S24 — SECURITY OPERATIONS
- Runbooks: تعطل الماسح، تواقيع قديمة، تحديث YARA، إيجابية خاطئة، اكتشاف خبيث، اختراق مفتاح، اختراق Decision، اختراق Release، تحميل الطابور، DR.

### S25 — CI/CD SECURITY GUARDRAILS
- فشل البناء عند: مسار رفع جديد خارج `ingestFile`، تسليم مباشر من التخزين، Signed URL جديد، معالج AI/OCR خام جديد، تجاوز Bucket عام، UPDATE مباشر للحالة، Parser جديد داخل التطبيق. تُضاف اختبارات تثبت أن الحرّاس نفسها تعمل (نمط `scripts/*-guardrails.ts` و`security-guardrails-db.ts`).

### S26 — ADVERSARIAL QA
- حزمة كاملة: EICAR، polyglot، MIME spoofing، امتدادات مزدوجة، PDF JS/OpenAction/EmbeddedFile، هجمات OOXML، CSV injection، قنابل صور، انهيار Parser/ماسح، false-clean، أدلة مزيفة، بصمة/مستأجر خاطئ، replay، TOCTOU، استنفاد طابور، فشل تخزين/DB/KMS، اختراق Decision/Verifier/Release.

### S27 — FUZZING
- مستمر على PDF/OOXML/الصور/CDR/عارض المعاينة/MIME/الأسماء/آلة الحالة/Decision/Verifier؛ النجاح ليس "بلا انهيار": يُراقب التعليق وتضخم الموارد والحالة غير المتوقعة وخرق الثوابت.

### S28 — CHAOS
- قتل العمال/المحركات/الطابور/KMS/اتصال DB/خدمة الإفراج/منطقة الماسح. المتوقع: لا إفراج غير آمن، والمنصة الأساسية تصمد.

### S29 — DR
- تمرين فعلي: إعادة بناء الماسح من الصفر (IaC، صور، قواعد، شهادات، KMS، طابور، إعدادات) وتسجيل RTO/RPO الفعليين.

### S30 — SHADOW MODE
- تشغيل موازٍ بلا منع: تسجيل ما كان سيُصنّف نظيفاً/مشبوهاً/محجوباً، والزمن، والإيجابيات الخاطئة، والأعطال. مدة الظل تُحدَّد بالأدلة لا برقم عشوائي، ولا تُستخدم لاحقاً لتمرير ملف بعد الإنفاذ.

## ENFORCEMENT GATE
تفعيل FILE_SECURITY_ENFORCEMENT = ON يشترط: نجاح كل الاختبارات الحرجة، صفر مسارات تجاوز، AV-A وYARA وStructural عاملة، AV-B عاملة إن كانت مطلوبة بالسياسة، Decision + Evidence 2-of-2 عاملة، Release Gate عاملة، سياسة Legacy جاهزة، Rollback مختبر، والمراقبة مفعّلة.

## ROLLBACK AFTER ENFORCEMENT
Rollback ≠ Fail Open: فشل الماسح = الملفات تبقى محجوزة؛ فشل Decision/Verifier = لا إفراج؛ فشل Release = لا تسليم؛ يمكن إيقاف قبول ملفات جديدة. لا يوجد SECURITY_OFF = ALLOW.

## PRODUCTION CANARY
مستأجر داخلي/اختباري → مستأجرون محدودون → توسّع، مع مقاييس ومراقبة؛ أي شذوذ أمني حرج يوقف التوسّع تلقائياً.

## EVIDENCE PACK (لكل اختبار)
Test ID، Control، Environment، Input، Expected، Actual، Timestamp، Commit SHA، Policy Version، Engine Versions، Evidence location، Verdict.

## EXTERNAL_ASSESSMENT_READINESS_CHECKLIST
لكل ضابط حرج: IMPLEMENTED + ADVERSARIAL_TESTED + EVIDENCE_AVAILABLE، مع حزمة الأدلة الكاملة (معمارية، حدود ثقة، نموذج تهديد، جرد، آلة حالة، جدول القرار، مصفوفة Fail-Closed، سياسات الشبكة والتخزين، اختبارات RLS والمستأجرين، أدلة المحركات، نتائج Fuzz/Chaos/DoS، حرّاس CI، أدلة التدقيق، تمرين DR، مواءمة NCA وASVS، المخاطر المتبقية).

## IMPLEMENTATION_DEPENDENCY_GRAPH
```text
S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → {S9, S10} → S11 → S12 → S13 → S14
S1 → S15 → S16 → S17 → S18 → S19
S1 → S20 → S21 → S22
S13 → S23
S2,S17,S19 → S25 → S26 → S27 → S28 → S29 → S30 → ENFORCEMENT → CANARY
S24 يسير بالتوازي من S9
```
CRITICAL_PATH: S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S15 → S16 → S17 → S18 → S19 → S26 → S30 → Enforcement.
WHICH_PHASES_CAN_BE_PARALLEL: (S9, S10) · (S20, S21) · (S24 مع أي مرحلة) · (S25 مع S15–S19) · (S14 مع S15–S17) · (S22, S23 بعد S13).
WHICH_PHASES_REQUIRE_SAUDI_INFRASTRUCTURE: S6, S7 (تنفيذ فعلي), S9, S10, S11, S12, S13 (محرك CDR), S29, وجزء من S28.
WHICH_PHASES_CAN_BE_BUILT_NOW_IN_LOVABLE: S0, S1, S2, S3 (طبقة تطبيق وتخزين), S4, S5 (إعادة هيكلة الحدود), S8 (منطق مشترك), S14, S15, S16, S17, S18, S19, S20, S21, S22 (الجرد), S23 (منطق البوابة), S25, S26 (جزء تطبيقي), S27 (خصائص وحالة), S30.
PRODUCTION_RISK_BY_PHASE: منخفض: S0, S1, S20, S21, S24, S25, S27, S30 · متوسط: S3, S8, S13, S14, S22, S23, S26, S28 · مرتفع: S2 (صلاحيات DB), S4, S5 (مسار الرفع), S17, S18, S19 (مسار التسليم), S6, S12 (بنية جديدة), Enforcement.
ESTIMATED_COMPLEXITY_BY_PHASE: صغير: S0, S24, S30 · متوسط: S1, S3, S4, S8, S14, S20, S21, S22, S23, S25 · كبير: S2, S5, S13, S15, S16, S17, S18, S19, S26, S27, S28, S29 · كبير جداً ومرتبط بالبنية: S6, S7, S9, S10, S11, S12.

## الخلاصة
ARCHITECTURE_FROZEN = YES
IMPLEMENTATION_STARTED = NO
PRODUCTION_CHANGED = NO
FIRST_RECOMMENDED_IMPLEMENTATION_PHASE = S0 — BASELINE & INVENTORY (بلا أي تغيير إنتاجي، ويليها S1 عند اعتماد المخطط)
FIRST_PHASE_REQUIRES_APPROVAL = YES

WAITING FOR IMPLEMENTATION PHASE 1 APPROVAL

---

# MEHLA FILE SECURITY S0.5 — EVIDENCE CLOSURE REPORT

## 1. Evidence Snapshot
Commit SHA = `29caf4fb70b2` · Supabase Project = مشروع مِهلة الحالي · Inventory/Schema timestamp = 2026-08-20 00:05 UTC · Repository = مشروع مِهلة (فرع العمل الحالي). كل قيم الصفر أدناه صفر داخل هذا الـSnapshot فقط.

## 2. Entrypoint Coverage (نتيجة صريحة لكل فئة)
| الفئة | النتيجة | الدليل |
|---|---|---|
| SUPPORT_ATTACHMENT | NOT_FOUND | `rg "support.*attachment|ticket.*attach" src` = لا نتائج؛ جداول الدعم بلا جدول مرفقات |
| ADMIN_UPLOAD | FOUND | `office-page.ops.server.ts`، `admin-ops.functions.ts` |
| IMPORT_FILE_INGESTION | NOT_FOUND (تصدير فقط) | `rg "import.*csv|parseCsv"` أعاد ملفات تصدير: `work-items/timeline.export.server.ts`، `kpi/kpi.export.server.ts`، `crm.functions.ts` |
| INTEGRATION_FILE_INGESTION | NOT_FOUND | `integrations/*.server.ts` بلا مسار بايتات ملفات |
| WEBHOOK_FILE_INGESTION | FOUND | `routes/api/public/hooks/email-inbound.ts` (مرفقات البريد) |
| HR_DOCUMENT_UPLOAD | FOUND | `src/lib/hr.functions.ts` + جدول `hr_documents` |
| THUMBNAIL_GENERATOR | NOT_FOUND | `rg "thumbnail|resize|sharp"` أعاد مطابقات UI/نص فقط |
| IMAGE_TRANSFORMER | NOT_FOUND | لا مكتبة صور خادمية |
| OFFICE_CONVERTER | NOT_FOUND | `rg "convert.*docx|libreoffice"` = لا نتائج (استخراج نص فقط عبر mammoth) |
| BACKGROUND_FILE_WORKER | FOUND | `document_processing_jobs` + `lib/document-ai.*` |
| CRON_FILE_PROCESSOR | FOUND | `routes/api/public/hooks/cleanup-secure-artifacts.ts` |
نقاط جديدة مكتشفة: **EP-08 HR documents** (`hr.functions.ts`)، **EP-09 email-inbound webhook**، **EP-10 background job worker**، **EP-11 cron cleanup**. الجرد الآن 11 نقطة.

## 3. Search Methodology Evidence
أنماط منفّذة فعلياً في `src` و`scripts`: `storage.from`، `createSignedUrl`، `createSignedUploadUrl`، `uploadToSignedUrl`، `getPublicUrl`، `supabaseAdmin`، `client.server`، `SUPABASE_SERVICE_ROLE_KEY`، `hr_documents`، `support.*attachment`، `thumbnail|resize|sharp`، `convert.*docx|libreoffice`، `import.*csv|parseCsv`، `multipart|FormData`. النطاق: كامل `src/` و`scripts/`.
ملاحظة: `storage.from(` لم يُطابق بنمط واحد بسبب فواصل الأسطر؛ الاستخراج تم عبر نمط `createSigned*` و`supabaseAdmin` — تغطية غير مكتملة لأنماط `upload/download/move/copy/remove` ⇒ هذه الجزئية **NOT_PROVEN**.

## 4. Call Graph Verification (نموذج مثبت)
`routes/upload.$token.tsx` → `client-portal.functions.ts` → `client-portal.server.ts` → `documents/intake.server.ts:createUploadSlot` → `supabaseAdmin.storage.from('documents').createSignedUploadUrl` → المتصفح `uploadToSignedUrl` → `verifyUploadedObject` (`download` + قراءة بايتات) → `documents` INSERT.
`routes/_authenticated/documents.tsx` → `intake.functions.ts` → نفس السلسلة. باقي السلاسل (بريد/عقود/وسائط) موثقة بالملفات لكن لم تُتبع حتى النهاية سطراً بسطر ⇒ **NOT_PROVEN** لثلاث سلاسل.

## 5. Raw Processor Matrix (لكل معالج)
| ID | المصدر | بايتات | شبكة/الجهة | أسرار | DB | Storage | service role | مزود خارجي | مخرَج | NOT_PROVEN |
|---|---|---|---|---|---|---|---|---|---|---|
| RP-01 | `documents/file-signature.ts` | YES | NO | NO | NO | NO | NO | لا | حكم قبول/رفض | — |
| RP-02 | `documents/intake.server.ts` | YES | YES (Supabase Storage) | YES (service role) | YES | YES | YES | لا | صف `documents` | — |
| RP-03 | `secure-view/*` + `pdf/*` | YES | YES (Storage) | YES (service role + مفاتيح تشفير) | YES | YES | YES | لا | PDF مائي | — |
| RP-04 | `ocr.server.ts` | YES (base64) | YES (`ai.gateway.lovable.dev`) | YES (`LOVABLE_API_KEY`) | NO | NO | NO | نعم | نص OCR | — |
| RP-05 | `document-ai.*` + `search_document_pages` | YES | YES (Storage) | YES | YES | YES | YES | لا | `document_pages` | — |
| RP-06 | `ai/bayan-*.server.ts` | NO (نص مستخرج) | YES (بوابة AI) | YES | YES | NO | YES | نعم | رد AI | — |
| RP-07 | `email/attachments.server.ts` | YES | YES (Storage/SMTP) | YES | YES | YES | YES | نعم (SMTP) | مرفق مخزّن | — |
| RP-08 | `contracts/contracts.server.ts` | YES | YES (Storage) | YES (سر HMAC مشتق) | YES | YES | YES | لا | PDF عقد | — |
| RP-09 | `office-page.server.ts` | YES | YES (Storage) | YES | YES | YES | YES | لا | وسائط مسودة/عامة | — |
| RP-10 (جديد) | `hr.functions.ts` | YES | YES | YES | YES | YES | YES | لا | `hr_documents` | — |
Runtime لكل ما سبق: Cloudflare Worker (SSR/server fn) — مثبت من `server-runtime` وبنية المشروع.

## 6. Service Role Blast Radius
مصدر واحد (`client.server.ts`) بمفتاح واحد، مستورد في 60+ وحدة، منها 12 وحدة ملفّية (intake، repair، secure-view، cleanup، email/attachments، office-page(.ops)، contracts(+lifecycle، download-audit)، sales-docs، client-portal، hr).
العمليات: SELECT/INSERT/UPDATE/DELETE على جداول المستندات + upload/download/remove/createSignedUrl على كل Buckets. التفويض بالمستأجر يُنفَّذ قبل النداء في intake وdocument-requests، لكن الاعتماد نفسه غير مقيّد بمستأجر.
CURRENT_SERVICE_ROLE_FILE_BLAST_RADIUS = **كامل** — اختراق أي وحدة خادمية تحمل هذا المفتاح يمنح قراءة/كتابة/حذف كل مستندات كل المكاتب وكل Buckets وتجاوز RLS.

## 7. SECRET_COUPLING_IMPACT_ASSESSMENT
| الموقع | السر المشتق | الاشتقاق | يعتمد عليه | أثر تدوير مفتاح الخدمة |
|---|---|---|---|---|
| `client-portal/portal-auth.server.ts:14` | ملح توكنات بوابة العميل | `process.env.SUPABASE_SERVICE_ROLE_KEY \|\| "mehla-portal-secure-salt-2026"` | بصمات توكنات الروابط المؤقتة | كل التوكنات القائمة تصبح غير صالحة؛ وجود fallback ثابت مكتوب في الكود = خطورة عالية |
| `contracts/contracts.server.ts:74` | سر HMAC لتذاكر تنزيل العقود | `SERVICE_ROLE_KEY \|\| SUPABASE_URL` | روابط تنزيل PDF الموقّعة | إبطال كل تذاكر التنزيل؛ الرجوع إلى `SUPABASE_URL` (قيمة غير سرية) = خطورة عالية جداً |
| `sms/otp.server.ts:119` | مفتاح Blind Index لأرقام الجوال | `MEHLA_BLIND_INDEX_KEY_V1 ?? SERVICE_ROLE_KEY` | البحث عن الأرقام المشفّرة | فقدان مطابقة الفهرس الأعمى للأرقام القائمة |
النتيجة: ربط مجالات أمنية مستقلة (تخزين/عقود/PII/بوابة عميل) بمادة مفتاح واحدة، مع مسارات fallback إلى قيم غير سرية. SECRET_COUPLING_SEVERITY = **CRITICAL**.

## 8. Signed Upload URL — Documented Facts
`createSignedUploadUrl(path)` من supabase-js v2 (المستخدم في `intake.server.ts:65`): ينشئ توكن رفع لمسار محدد، يستهلكه العميل عبر `uploadToSignedUrl`، ويتطلب صلاحية INSERT للطرف المُنشئ (هنا service role). المدة الافتراضية الموثقة والقابلية للتهيئة، وسلوك upsert/overwrite/replay/one-time: لم يُتحقق منها من الوثائق الرسمية في هذه الجلسة ⇒ SIGNED_UPLOAD_TTL = NOT_PROVEN · SIGNED_UPLOAD_ONE_TIME = NOT_PROVEN · SIGNED_UPLOAD_REPLAY = NOT_PROVEN.

## 9. Signed Upload Runtime Test
لا تتوفر بيئة تخزين غير إنتاجية معزولة لهذا المشروع، والاختبار على الإنتاج ممنوع بأمر الموافقة ⇒ **NOT_PROVEN** (لم يُجرَ أي رفع اختباري).

## 10. Immutability Capability
Supabase Storage لا يوفّر Object Lock ولا Retention Lock ولا Versioning للكائنات في الإعداد المستخدم؛ لم يُثبت العكس بقراءة وقت تشغيل ⇒ NATIVE_OBJECT_LOCK = NOT_AVAILABLE/NOT_PROVEN · STORAGE_VERSIONING = NOT_PROVEN. المتوفر فعلياً اليوم = APPLICATION_ENFORCED_NO_OVERWRITE فقط (مسار UUID فريد لكل رفع + عدم upsert)، وهو ليس immutability. اختيار البديل يُترك لـS3.

## 11. Storage Policy Verification
لم تُنفَّذ قراءات قاعدة بيانات وقت التشغيل في هذه البوابة (تُصنَّف كتحقق تشغيلي خارج نطاق القراءة المصرّح بها هنا) ⇒ RUNTIME_DB_VERIFICATION = BLOCKED_BY_SCOPE لكل من documents / email-attachments / office-media-draft / office-public-media (public/INSERT/SELECT/UPDATE/DELETE/RLS/حد الحجم/MIME). المعروف من الكود فقط: `documents` خاص وصوله خادمي، و`office-public-media` عام.

## 12. Temp Client Link — Replay Analysis
من `client-portal.server.ts` + `intake.server.ts`: رابط الطلب صالح حتى `expires_at`؛ خلاله يمكن طلب أكثر من فتحة رفع (حتى 15 ملفاً) — أي عدة قدرات رفع لكل رابط. كل فتحة تولّد مساراً UUID جديداً، لذا الكتابة على مسار قائم غير مطلوبة؛ لكن إعادة استخدام نفس توكن الفتحة أو مشاركتها مع طرف ثالث = NOT_PROVEN (يتطلب اختبار وقت تشغيل). التسابق: الحماية النهائية هي فهرس فريد على `documents.file_path` + `assertPathNotLinked`. لم يُغيَّر أي سلوك.

## 13. Public Media Attack Surface
مسارات الكتابة العامة المكتشفة: `office-page.server.ts` (مسودة → موقّعة)، `office-page.ops.server.ts` (عمليات إدارية)، `routes/api/public/office/media/$.ts` (تقديم عام). `rg getPublicUrl src` = لا نتائج (بناء الروابط العامة يتم بمسار مختلف) ⇒ UNKNOWN_PUBLIC_MEDIA_WRITE_PATHS = NOT_PROVEN حتى تتبع سلسلة النشر draft→public سطراً بسطر.

## 14. AI / OCR / Bayan Flow
`documents` (file_status = AVAILABLE فوراً بعد الرفع) → `document_processing_jobs` → استخراج/OCR (`ocr.server.ts` إلى بوابة AI خارجية) → `document_pages` → `search_document_pages` → بيان. لحظة التأهيل = لحظة إنشاء الصف. لا يوجد أي شرط حالة أمنية في أي حلقة ⇒ غياب Security Release Gate **مثبت** من الكود والمخطط (لا عمود scan/decision موجود).

## 15. Negative Evidence
لكل NOT_FOUND أعلاه: النطاق = `src/` (وأحياناً `scripts/`)، الأنماط مذكورة في القسم 2، الأدلة من تنفيذ `rg` في نفس الـSnapshot، SHA = `29caf4fb70b2`.

## 16. النتيجة
S0_SNAPSHOT_SHA = 29caf4fb70b2
S0_ENTRYPOINT_COVERAGE = PROVEN (11 نقطة مع أدلة سلبية لكل فئة غير موجودة)
S0_DELIVERY_COVERAGE = PROVEN (6 مسارات، أدلة سطرية)
S0_RAW_PROCESSOR_COVERAGE = PROVEN (10 معالجات بمصفوفة تفصيلية)
PUBLIC_MEDIA_PATHS_EVIDENCED = NOT_PROVEN
SERVICE_ROLE_FILE_USAGE_EVIDENCED = YES
SIGNED_UPLOAD_TTL = NOT_PROVEN
SIGNED_UPLOAD_ONE_TIME = NOT_PROVEN
SIGNED_UPLOAD_REPLAY = NOT_PROVEN
NATIVE_OBJECT_LOCK = NOT_AVAILABLE / NOT_PROVEN
STORAGE_VERSIONING = NOT_PROVEN
STORAGE_IMMUTABILITY_CAPABILITY = NOT_PROVEN (المتوفر: APPLICATION_ENFORCED_NO_OVERWRITE)
SERVICE_ROLE_BLAST_RADIUS = كامل — كل المستندات وكل المكاتب وكل Buckets
SECRET_COUPLING_SEVERITY = CRITICAL
NEW_ENTRYPOINTS_DISCOVERED = EP-08 HR، EP-09 email-inbound webhook، EP-10 background job worker، EP-11 cron cleanup
NEW_CRITICAL_FINDINGS = BP-09 اشتقاق أسرار من مفتاح الخدمة مع fallback إلى قيم غير سرية (`contracts.server.ts:74`, `portal-auth.server.ts:14`)
S0_FINAL_STATUS = NOT_PROVEN (التغطية أُثبتت؛ خصائص روابط الرفع وimmutability وسياسات Buckets تحتاج تحقق وقت تشغيل في بيئة معزولة)

S1_APPROVAL = NOT_GRANTED

WAITING FOR S0.5 SECURITY REVIEW
