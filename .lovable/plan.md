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
