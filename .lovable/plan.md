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

# MEHLA FILE SECURITY S0 — VERIFIED ATTACK SURFACE INVENTORY

READ-ONLY DISCOVERY فقط. لا Migration ولا SQL كتابة ولا تعديل تخزين/صلاحيات/ملفات.

## FILE_ENTRYPOINT_INVENTORY
| ID | المصدر | السلوك | الفاعل | حدود المستأجر | الاعتماد | بايتات خام | الحماية | الخطورة |
|---|---|---|---|---|---|---|---|---|
| EP-01 | `documents/intake.functions.ts` + `intake.server.ts` | فتحة رفع موقّعة ثم تحقق وربط | مصادق | بادئة organization_id | service role | نعم (`verifyUploadedObject`) | دور كتابة + حصص + Magic Bytes | مرتفع |
| EP-02 | `routes/upload.$token.tsx:97` | رفع عميل بتوكن مؤقت | مجهول بتوكن | من القضية | توكن رفع موقّع | نعم (خادمياً) | حد IP + نوع/حجم | مرتفع |
| EP-03 | `routes/_authenticated/documents.tsx:370` | رفع لوحة المكتب | مصادق | نعم | توكن فتحة | نعم | كما EP-01 | متوسط |
| EP-04 | `email/attachments.server.ts` | مرفقات بريد | مصادق/Webhook | نعم | service role | نعم | Allowlist + حظر امتدادات | متوسط |
| EP-05 | `office-page.server.ts:118` | وسائط المكتب draft→public | مصادق | نعم | service role | نعم | تحقق نوع فقط | مرتفع |
| EP-06 | `documents/repair.server.ts` | إصلاح/قديم | إداري | نعم | service role | نعم | صلاحية إدارية | متوسط |
| EP-07 | `contracts/*`, `sales-docs.server.ts` | ملفات العقود/البيع | مصادق/موقّع خارجي | نعم | service role | نعم | تذاكر HMAC | متوسط |

## FILE_DELIVERY_INVENTORY + SIGNED_URL_INVENTORY
DL-01 `secure-view.server.ts:297` (60s) · DL-02 `email/attachments.server.ts:287,361` (300s) · DL-03 `subscription.functions.ts:83` (60s) · DL-04 `office-page.server.ts:118` (300s) · DL-05 `api/public/doc.$token.ts` + `share.$token.tsx` (تذكرة) · DL-06 `api/public/office/media/$.ts` (عام).

## SIGNED_UPLOAD_INVENTORY
SU-01 `intake.server.ts:65` `createSignedUploadUrl` — أحادية الاستخدام وTTL: **NOT_PROVEN**؛ `upsert=false` لا يساوي immutability.

## RAW_FILE_PROCESSOR_INVENTORY (9)
RP-01 `documents/file-signature.ts` · RP-02 `documents/intake.server.ts` · RP-03 `secure-view/*` + `pdf/*` · RP-04 `ocr.server.ts` (يرسل صوراً لمزود خارجي) · RP-05 `document-ai.*` + `search_document_pages` · RP-06 `ai/bayan-*.server.ts` · RP-07 `email/attachments.server.ts` · RP-08 `contracts/contracts.server.ts` · RP-09 `office-page.server.ts`.
كلها: تفكيك بايتات = نعم، شبكة = نعم، أسرار = نعم، سياق مستأجر = نعم، ويصلها ملف غير موثوق اليوم = نعم.

## STORAGE_INVENTORY / PUBLIC_STORAGE_INVENTORY
documents (خاص) · email-attachments (خاص) · office-media-draft (خاص) · **office-public-media (عام)**. Object Lock/Versioning/One-time semantics: **NOT_PROVEN** في بوابة قرائية.

## PRIVILEGED_STORAGE_ACCESS + SERVICE_ROLE_USAGE
مصدر وحيد للمفتاح: `integrations/supabase/client.server.ts:37-51`. 60+ وحدة تستورد `supabaseAdmin`؛ الملفّية منها: intake، repair، secure-view (+cleanup)، email/attachments، office-page(.ops)، contracts، sales-docs، client-portal، ai/bayan. هوية موحدة واحدة — لا فصل هويات (ماسح/قرار/أدلة/تسليم).
اقتران أسرار: `client-portal/portal-auth.server.ts:14`، `contracts/contracts.server.ts:74`، `sms/otp.server.ts:119` تشتق أسراراً من مفتاح الخدمة.

## DATABASE_FILE_SECURITY_INVENTORY
جداول ملفّية: documents، document_pages، document_processing_jobs، document_requests(+events)، document_access_tokens/logs، email_attachments، print_audit_logs، contract_*، sales_document_*، hr_documents.
لا وجود لأي `scan_status` / `sha256` / قرار أمني / نسب. `documents.file_status` يُكتب مباشرة (`intake.functions.ts:91` = AVAILABLE) بلا دالة انتقال محكومة. محارس قائمة (`deny_update`, `deny_hard_delete`, `contracts_immutability_guard`, `document_requests_guard`, `print_audit_enforce_actor`) لا تغطي الفحص الأمني.

## CLIENT_TEMP_LINK_INVENTORY
`expires_at` للطلب · 15 ملفاً · 20MB لكل ملف · أنواع محددة · 30 محاولة/8 فشل لكل IP/15 دقيقة (`guardUploadToken`) · ربط المستأجر من القضية مع رفض عند اختلاف المكتب · إعادة الاستخدام ضمن المدة (أحادية الاستخدام NOT_PROVEN) · البايتات تهبط في bucket `documents` النهائي وتصبح `AVAILABLE` فوراً.

## AI_OCR_SEARCH_FILE_FLOW
documents → استخراج/OCR → document_pages → search_document_pages → بيان، بلا أي بوابة إفراج.

## CURRENT_TRUST_BOUNDARIES
منطقة ثقة واحدة فعلياً: التطبيق يقرأ البايتات ويحمل مفتاح الخدمة ويكتب الحالة ويصدر الروابط. لا Zone Q/H/D/R.

## CURRENT_BYPASS_PATHS
BP-01 UPLOAD_BYPASS (لا حجر) CRITICAL · BP-02 RAW_PROCESSOR_BYPASS CRITICAL · BP-03 DELIVERY_BYPASS (روابط تخزين) HIGH · BP-04 PUBLIC_STORAGE_BYPASS CRITICAL · BP-05 AI/OCR_BYPASS CRITICAL · BP-06 STATE_BYPASS CRITICAL · BP-07 SECRET_COUPLING CRITICAL · BP-08 REPAIR/LEGACY HIGH.

## VERIFIED_DEPENDENCY_GRAPH_V2
```text
S0 → S1 → S2 → S3 → S4 → S5A (RAW PROCESSING BOUNDARY REFACTOR)
S5A → S6 → S7 → S8 → S5B (CUTOVER) ⇒ RAW_UNTRUSTED_APP_PROCESSING = 0
S8 → {S9,S10} → S11 (AV-B REQUIRED، لا يصبح Optional) → S12 → S13
S15/S16 عقود مبكراً؛ DECISION_ENGINE_INTEGRATION_GATE لا ينجح قبل نتائج S8–S13
S16 → S17 → S18 → S19 ; S13+S17+S19 → S23 ; S9..S19 → S21
S22: الجرد مبكراً، الترحيل/إعادة الفحص بعد اكتمال الأنبوب
S27 يبدأ مع أول Parser ويستمر ; S26 بعد كل الضوابط الحرجة ; S20/S24/S25 بالتوازي
```

## S0 ACCEPTANCE GATE
UNKNOWN_FILE_ENTRYPOINTS = 0 · UNKNOWN_DELIVERY_PATHS = 0 · UNKNOWN_RAW_PROCESSORS = 0 · UNKNOWN_STORAGE_PATHS = 0 · UNKNOWN_SIGNED_URL_PATHS = 0 · UNKNOWN_PRIVILEGED_STORAGE_CLIENTS = 0 · UNKNOWN_SERVICE_ROLE_FILE_PATHS = 0 — كلها مدعومة بأدلة كود/DB أعلاه.
Immutability وTTL وأحادية استخدام روابط الرفع: NOT_PROVEN (يتطلب تحقق وقت تشغيل غير مسموح في هذه البوابة).

## النتيجة
S0_STATUS = NOT_PROVEN (الجرد مكتمل؛ خصائص التخزين/الروابط غير مثبتة)
PRODUCTION_CHANGED = NO
DATABASE_CHANGED = NO
STORAGE_CHANGED = NO
CODE_BEHAVIOR_CHANGED = NO
UNKNOWN_FILE_ENTRYPOINTS = 0
UNKNOWN_DELIVERY_PATHS = 0
UNKNOWN_RAW_PROCESSORS = 0
CRITICAL_FINDINGS = BP-01, BP-02, BP-04, BP-05, BP-06, BP-07
HIGH_FINDINGS = BP-03, BP-08, SU-01, غياب البصمات/النسب، هوية خدمة موحدة
MASTER_PLAN_DEPENDENCIES_CORRECTED = YES

S1_APPROVAL = NOT_GRANTED

WAITING FOR S0 SECURITY REVIEW
