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

# MEHLA FILE SECURITY — ACR-01 & S0 FINAL EVIDENCE CORRECTION PLAN

BASE_ARCHITECTURE_V5 = FROZEN · ACR_01_STATUS = OPEN · لا تنفيذ ولا Migration ولا تغيير أسرار/تخزين/إنتاج.

## 1. تصحيح تناقض S0.5
كل ادعاء "PROVEN" في S0.5 يُخفَّض حيث كان الدليل ناقصاً. مستويات الثقة المعتمدة من الآن: OBSERVED_IN_CODE · OBSERVED_IN_DB · OBSERVED_AT_RUNTIME · DOCUMENTED_BY_PROVIDER · INFERRED · NOT_PROVEN. كلمة PROVEN ممنوعة لادعاء سلوك وقت تشغيل مدعوم بالكود فقط. ⇒ S0_ENTRYPOINT_COVERAGE = NOT_PROVEN حتى إغلاق البنود 2 و3 و13.

## 2. FULL FILE-OPERATION SEARCH (نتيجة هذه الجلسة)
تم تنفيذ أنماط: `storage`، `.from("documents")`، `createSignedUploadUrl|uploadToSignedUrl`، `createSignedUrl`، `.upload(`، `.download(`، `.move(|.copy(`، `.remove(`، `getPublicUrl`، `ArrayBuffer|Uint8Array|arrayBuffer()`، `FormData|multipart` على `src` و`scripts`.
- سطح التخزين الحقيقي (OBSERVED_IN_CODE): `documents/intake.server.ts`، `email/attachments.server.ts`، `office-page.server.ts`، `office-public.server.ts`، `secure-view/secure-view.server.ts`، `secure-view/cleanup.server.ts`، `subscription.functions.ts`، `routes/upload.$token.tsx`، `routes/_authenticated/documents.tsx`.
- `getPublicUrl` = لا نتائج · `.move(`/`.copy(` = لا نتائج (نشر الوسائط يتم download+upload) · `FormData/multipart` خادمياً في `email/transport/mime.server.ts` فقط.
- ما لم يُغطَّ بعد: Wrappers غير مباشرة (دوال محلية تُغلّف الاستدعاء)، وأنماط `Blob/File/ReadableStream`، وملفات `src/lib/**` غير المفتوحة سطراً بسطر ⇒ FILE_OPERATION_SEARCH_COVERAGE = NOT_PROVEN (يُغلق بسكربت جرد ثابت `scripts/file-op-inventory.ts` يُقترح في P0، يعدّ كل استدعاء ويطابقه بقائمة مسموحة).

## 3. COMPLETE CALL GRAPHS — نموذج الإغلاق المطلوب
لكل EP-01..EP-11 يُطلب الشكل: ENTRYPOINT → AUTHORIZATION → TENANT RESOLUTION → SERVER FUNCTION → STORAGE/DB → RAW PROCESSOR → DELIVERY.
مكتمل حالياً (OBSERVED_IN_CODE): EP-01 رفع داخلي، EP-02 رفع عبر رابط العميل.
ناقص ويجب إغلاقه قبل S1: EP-03 عقود، EP-04 مرفقات بريد صادر، EP-09 email-inbound، EP-06 وسائط عامة، EP-07 repair، EP-08 HR، EP-10 background worker، EP-11 cron cleanup، EP-05 secure-view/طباعة.
⇒ CALL_GRAPH_COVERAGE = NOT_PROVEN (2/11).

## 4–5. SECURITY_ROOT_OF_TRUST_SEPARATION
مجالات أسرار مستقلة تماماً، كل واحد بمفتاح خاص ونسخة مفتاح (key_version) ولا يشتق من غيره:
`PORTAL_TOKEN_SECRET` · `CONTRACT_HMAC_SECRET` · `BLIND_INDEX_KEY` · `FILE_SECURITY_SIGNING_KEY` · `DECISION_KEY` · `EVIDENCE_VERIFIER_KEY` · `DELIVERY_KEY` · `SCANNER_IDENTITY` (≠ APPLICATION_IDENTITY).
قاعدة الفصل: لا مجال يستطيع التحقق من رموز مجال آخر؛ كل رمز يحمل `aud` + `purpose` + `kid`، والتحقق يرفض أي `aud` غير مطابق. اختراق مجال واحد لا يمنح انتحال مجال آخر.

## 6. NO INSECURE FALLBACK
قاعدة: `MISSING_SECURITY_SECRET = FAIL_CLOSED` — إما فشل بدء الميزة (رفض العملية برسالة عربية عامة + معرّف تتبع) وليس fallback. ممنوع نهائياً: `SECRET || SERVICE_ROLE_KEY`، `SERVICE_ROLE_KEY || SUPABASE_URL`، `SECRET || "قيمة ثابتة"`.
المواقع المرصودة (OBSERVED_IN_CODE): `contracts/contracts.server.ts:74`، `client-portal/portal-auth.server.ts:14`، `sms/otp.server.ts:119`. تُصلح في ACR-01-IMPL (مرحلة تنفيذ لاحقة بعد الاعتماد) لا الآن.
حارس CI مقترح: فشل البناء عند ظهور نمط fallback في أي ملف `*.server.ts` ضمن مجالات الأمن.

## 7. SECRET MIGRATION DESIGN (تصميم فقط)
- **Portal token hashing**: إضافة `key_version` لصفوف التوكنات؛ dual-read (تحقق بالمفتاح الجديد ثم القديم)؛ التوكنات الجديدة بالمفتاح الجديد فقط؛ نافذة تقاعد = أقصى TTL للتوكنات القائمة؛ بعدها حذف مسار المفتاح القديم.
- **Contract HMAC tickets**: التذاكر قصيرة الأجل (ساعة) ⇒ dual-verify لمدة نافذة واحدة فقط ثم retirement؛ لا حاجة لإعادة إصدار بيانات.
- **Blind index key**: الأخطر — يتطلب re-index migration: عمود `phone_bidx_v2` يُحسب بالمفتاح الجديد، كتابة مزدوجة، backfill مجمّع، تحويل البحث إلى v2، ثم إسقاط v1. لا حذف بيانات ولا فقدان قابلية بحث في أي لحظة.

## 8. SERVICE_IDENTITY_SEPARATION_MODEL
لا نفترض تعدد مفاتيح service_role. آليات الفصل المتاحة فعلياً، بترتيب التفضيل:
1) **Narrow RPC + SECURITY DEFINER محصورة**: كل خدمة أمنية تتحدث فقط عبر دوال محددة الغرض (تسجيل نتيجة فحص، طلب قدرة، تسجيل قرار)، لا SELECT عام.
2) **PostgreSQL roles مخصصة** بصلاحيات جدول/عمود دقيقة، تُستدعى عبر Broker.
3) **Backend broker مستقل** يحمل الاعتماد ويصدر قدرات معنونة بالكائن (object-scoped, purpose-bound, tenant-bound, TTL قصير).
4) **service-specific credentials** لخدمات خارج Supabase (الماسحات) بلا أي اعتماد Supabase.
النتيجة المستهدفة: اختراق OCR ≠ قراءة كل المستندات · اختراق Release ≠ حذف Buckets · اختراق بوابة العميل ≠ تجاوز RLS على مستوى المنصة.

## 9. FILE SECURITY BROKER
Scanner Worker: بلا service role، بلا DB، بلا وصول واسع للتخزين — يتلقى بايتات ملف واحد عبر قدرة قراءة لحظية ويعيد نتيجة موقّعة.
Decision Engine و Evidence Verifier: لا وصول لبايتات خام إطلاقاً (أدلة موقّعة فقط).
Release: لا يملك اعتماد تخزين رئيسي، فقط قدرة معنونة بالكائن. كل وصول: purpose-bound + file-bound + tenant-bound + short-lived + مسجَّل.

## 10. QUARANTINE — ترقية المعيار
| خيار | Immutability | التعقيد | الحكم |
|---|---|---|---|
| A) Supabase + application-enforced | ضعيف (لا Object Lock/Versioning مُثبت) | منخفض | مرحلي فقط |
| B) تخزين كائنات سعودي بـ Object Lock/WORM/Versioning | قوي (منع الكتابة على مستوى المخزن) | مرتفع | **موصى به للحجر** |
| C) مخزن حجر مخصص منفصل عن التخزين النهائي | متوسط–قوي حسب المزود | متوسط | إلزامي كبنية بأي خيار |
التوصية: **B + C** — حجر منفصل على مخزن يدعم Object Lock أصلياً. NATIVE_IMMUTABILITY_REQUIRED = YES (لا تخفيض للمعيار؛ إن تعذّر عملياً يبقى الضابط DISABLED لا "مخفَّض صامتاً").

## 11. UPLOAD_SLOT — رمز المزود ليس جذر ثقة
`upload_slots`: `slot_id`, `organization_id`, `actor_ref`, `object_key`, `nonce`, `max_bytes`, `allowed_type_policy`, `expected_constraints`, `created_at`, `expires_at`, `consumed_at`.
الاستهلاك ATOMIC SINGLE CONSUMPTION (UPDATE شرطي على `consumed_at IS NULL` داخل دالة محصورة). رمز المزود = Transport Capability فقط؛ Mehla Slot = Security Authorization. أي كائن يظهر في الحجر بلا Slot مطابق = يُصنَّف ORPHAN ولا يُفرَج عنه أبداً.

## 12. STOLEN_UPLOAD_CAPABILITY_THREAT_MODEL
بسرقة القدرة، يجب أن يستحيل: تغيير المستأجر (مثبت في الـSlot) · تغيير الكائن (`object_key` مثبت) · الرفع أكثر من مرة (استهلاك ذري) · نقل الملف إلى `released` (يتطلب 2-of-2) · الاستخدام بعد `expires_at` · إنشاء صف `documents` ثانٍ (فهرس فريد على object_key + ربط Slot واحد لصف واحد). كل محاولة تُسجَّل وتُرفع كحادث عند التكرار.

## 13. PUBLIC MEDIA — مسار الإثبات
سلسلة يجب تتبعها بالكامل: إنشاء المسودة → عمليات إدارية (`office-page.ops.server.ts`) → نسخ/رفع (download+upload، لا `.copy`) → النشر (لقطة منشورة) → التقديم العام (`routes/api/public/office/media/$.ts` → `office-public.server.ts:readPublishedMedia`) → الاستبدال/الحذف/التنظيف. الهدف: UNKNOWN_PUBLIC_MEDIA_WRITE_PATHS = 0 مع دليل سطري لكل حلقة. حالياً PUBLIC_MEDIA_WRITE_PATH_COVERAGE = NOT_PROVEN.

## 14–17. نقاط الدخول الجديدة كمواطنين كاملين
- **EP-08 HR**: لا استثناء — يدخل الحجر والفحص والقرار والإفراج والمعاينة والقديم وحرّاس CI وQA العدائي.
- **EP-09 email-inbound**: `EXTERNAL_UNTRUSTED_SOURCE` — أعلى Baseline (Structural + AV-A + AV-B + YARA + Dynamic حيث تنطبق السياسة + CDR + rescan + release).
- **EP-10 background worker**: Entrypoint وProcessor معاً. يجب إثبات: من يُنشئ Job، حالات الملف المقبولة، هل يعالج AVAILABLE مباشرة (المؤشر الحالي: نعم — INFERRED)، الاعتماد المستخدم، البيانات الخارجة. الهدف: BACKGROUND_PROCESSOR_BEFORE_RELEASE = 0.
- **EP-11 cron cleanup**: صلاحية حذف محصورة بـ eligible expired artifacts فقط؛ يستحيل حذف أدلة مُفرَجة أو سجل تدقيق أمني أو ملفات نشطة لمستأجر آخر أو خزنة الأدلة.

## 18. AI_OCR_EXTERNAL_DATA_FLOW_RISK
OBSERVED_IN_CODE: `ocr.server.ts` يرسل بايتات صفحة/صورة بترميز base64 إلى `ai.gateway.lovable.dev` بمفتاح `LOVABLE_API_KEY`؛ `ai/bayan-*.server.ts` يرسل نصاً مستخرجاً من المستندات. المحتوى قد يشمل مستندات قانونية وبيانات هوية داخل الصور/النص.
المخاطر: خروج بيانات قانونية حساسة إلى معالجة خارج المملكة (سيادة البيانات)، غياب تصنيف/تنقيح قبل الإرسال، غياب موافقة صريحة على مستوى المكتب، واحتمال احتفاظ المزود بالمحتوى (غير مُثبت).
الحكم: AI_OCR_EXTERNAL_DATA_FLOW_RISK = HIGH — يتطلب قراراً معمارياً منفصلاً (معالجة داخلية/سعودية، أو تنقيح مسبق، أو موافقة مكتب صريحة + سجل خروج بيانات). لا تغيير الآن.

## 19–20. P0 — ISOLATED FILE SECURITY VALIDATION ENVIRONMENT (تصميم فقط)
مشروع/تخزين منفصل، أسرار منفصلة، Buckets منفصلة، بيانات صناعية فقط، بلا أي مستند إنتاجي وبلا service role إنتاجي. تُستخدم لإثبات: إعادة استخدام رمز الرفع، TTL، الرفع المتزامن، الكتابة الفوقية، سياسات التخزين، دلالات الحجر، RLS، آلة الحالة، اختبارات الفشل.
Invariant: SECURITY_DESTRUCTIVE_TESTS_ON_PRODUCTION = 0 — كل اختبارات overwrite/replay/EICAR/fuzzing/bombs/scanner-compromise في Lab/Staging فقط، ثم Canary منضبط.

## 21. REVISED IMPLEMENTATION ORDER
S0 → S0.5 → **ACR-01** → **P0 (Security Lab)** → S1 → S2 … S30. لا S1 قبل اعتماد ACR-01 وتصميم P0.

## 23. CRITICAL FINDINGS REGISTER
| ID | الوصف | الدليل | سيناريو الهجوم | نطاق الأثر | الضابط المعماري | مرحلة التنفيذ | التحقق | الحالة |
|---|---|---|---|---|---|---|---|---|
| CF-01 | لا حجر — الرفع إلى التخزين النهائي مباشرة | OBSERVED_IN_CODE `intake.server.ts` | ملف خبيث يصبح متاحاً فوراً | كل المستندات | Immutable Quarantine | S3, S4 | Lab | OPEN |
| CF-02 | معالجة بايتات خام قبل الإفراج الأمني | OBSERVED_IN_CODE `verifyUploadedObject`, `ocr`, `secure-view` | استغلال Parser داخل التطبيق | التطبيق الرئيسي | Zone H + عمّال معزولون | S5, S6 | Fuzz/Chaos | OPEN |
| CF-03 | نشر وسائط عامة بلا بوابة إفراج | OBSERVED_IN_CODE `office-page.server.ts` | استضافة محتوى خبيث عام | سمعة + زوار | فحص+CDR قبل النشر | S23 | Lab | OPEN |
| CF-04 | تجاوز AI/OCR للحالة الأمنية + خروج بيانات خارجي | OBSERVED_IN_CODE `ocr.server.ts` | ملف غير مفحوص يُعالَج/يخرج | خصوصية قانونية | بوابة حالة + قرار سيادة بيانات | S5, S12, قرار مستقل | مراجعة تدفق | OPEN |
| CF-05 | تحديث مباشر للحالة بلا آلة حالة | OBSERVED_IN_CODE (لا أعمدة حالة أمنية) | ترقية حالة إلى released | كل الملفات | Trigger + SECURITY DEFINER | S2 | مصفوفة انتقالات | OPEN |
| CF-06 | جذر ثقة واحد لمفتاح الخدمة، نطاق أثر كامل | OBSERVED_IN_CODE 60+ وحدة | اختراق وحدة = كل المستندات | كل المستأجرين | Service Identity Separation + Broker | ACR-01-IMPL, S18 | مراجعة صلاحيات | OPEN |
| CF-07 | اقتران أسرار + fallback غير آمن | OBSERVED_IN_CODE `contracts:74`, `portal-auth:14`, `otp:119` | تزوير تذاكر/توكنات عند معرفة قيمة الرجوع | عقود + بوابة عميل + PII | فصل مجالات + FAIL_CLOSED | ACR-01-IMPL | حارس CI | OPEN |
| CF-08 | دلالات قدرة الرفع (TTL/replay/one-time) غير مُثبتة | NOT_PROVEN | إعادة استخدام قدرة مسروقة | رفع غير مصرّح | UPLOAD_SLOT + استهلاك ذري | S4 | P0 Lab | OPEN |
| CF-09 | immutability التخزين غير مُثبتة | NOT_PROVEN | استبدال ملف بعد الفحص (TOCTOU) | سلامة الأدلة | Object Lock أصلي (خيار B+C) | S3 | P0 Lab | OPEN |
| CF-10 | مسارات كتابة الوسائط العامة غير مُثبتة | NOT_PROVEN | مسار كتابة غير مدرَج | وسائط عامة | جرد كامل + حارس CI | S0 إغلاق, S23 | تتبع سطري | OPEN |
| CF-11 (جديد) | AI/OCR data egress خارج المملكة بلا تصنيف/موافقة | OBSERVED_IN_CODE | كشف مستند قانوني لجهة خارجية | سيادة بيانات | قرار معالجة داخلية/تنقيح/موافقة | قرار مستقل قبل S12 | مراجعة تدفق | OPEN |
| CF-12 (جديد) | Background worker يعالج ملفات بحالة AVAILABLE بلا بوابة | INFERRED | معالجة ملف خبيث تلقائياً | معالجة خادمية | BACKGROUND_PROCESSOR_BEFORE_RELEASE = 0 | S5, S15 | Lab | OPEN |
| CF-13 (جديد) | cron cleanup بصلاحية حذف واسعة بلا governance | OBSERVED_IN_CODE `cleanup-secure-artifacts.ts` | حذف أدلة/سجلات | أدلة وتدقيق | صلاحية محصورة بالمؤهل للانتهاء | S20, S24 | اختبار صلاحيات | OPEN |

## 25. الناتج
FILE_OPERATION_SEARCH_COVERAGE = NOT_PROVEN
CALL_GRAPH_COVERAGE = NOT_PROVEN (2/11 مكتمل)
PUBLIC_MEDIA_WRITE_PATH_COVERAGE = NOT_PROVEN
S0_ENTRYPOINT_COVERAGE = NOT_PROVEN (تصحيح لتناقض S0.5)
S0_FINAL_STATUS = NOT_PROVEN
SERVICE_ROLE_BLAST_RADIUS = FULL
SECRET_COUPLING_STATUS = CRITICAL — COUPLED
INSECURE_SECRET_FALLBACKS_PRESENT = YES (3 مواقع)
ROOT_OF_TRUST_SEPARATION_DESIGNED = YES
SIGNED_UPLOAD_SECURITY_MODEL_DESIGNED = YES (UPLOAD_SLOT)
NATIVE_IMMUTABILITY_REQUIRED = YES (الخيار الموصى به B + C)
NON_PRODUCTION_SECURITY_LAB_DESIGNED = YES (P0)
NEW_CRITICAL_FINDINGS = CF-11, CF-12, CF-13
UNRESOLVED_CRITICAL_DESIGN_GAPS = إغلاق أدلة S0 (بنود 2/3/13)، توفر Object Lock في بنية سعودية، دلالات قدرة الرفع، سيادة بيانات AI/OCR، آلية فصل هوية الخدمات على Supabase
BASE_ARCHITECTURE_V5 = FROZEN
ACR_01_STATUS = READY_FOR_REVIEW
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR ACR-01 SECURITY REVIEW

---

# MEHLA FILE SECURITY — ACR-01 REVISION 2 FINAL REVIEW PLAN

مراجعة معمارية فقط. BASE_ARCHITECTURE_V5 = FROZEN · لا تنفيذ/Migration/أسرار/تخزين/نشر.

## 1–2. إغلاق الأدلة (منهج، لا ادعاء)
Call Graph لكل EP يجب أن يغطي: ENTRYPOINT → ACTOR → AUTHENTICATION → AUTHORIZATION → TENANT RESOLUTION → TOKEN/CAPABILITY → DB → STORAGE → RAW PROCESSING → EXTERNAL NETWORK → OUTPUT → DELIVERY → DELETE/CLEANUP. أي حلقة غير مقروءة سطرياً = NOT_PROVEN. الحالي 2/11 (EP-01, EP-02 فقط) ⇒ لا يجوز إعلان S0_ENTRYPOINT_COVERAGE = PROVEN.
إغلاق FILE_OPERATION_SEARCH_COVERAGE يتطلب أداة جرد ثابتة (AST-based) تعدّ الاستدعاءات المباشرة وWrappers والاستيرادات المُسمّاة عبر: upload/download/copy/move/remove/delete/signed URL/public URL/stream/buffer/blob/file/multipart/formdata/attachment/media/document، وتطابقها بقائمة مسموحة تُفشل CI عند أي عنصر جديد. الهدف: EVIDENCE_COMPLETE (لم يتحقق بعد).

## 3. SECURITY DEFINER HARDENING RULES (إلزامية)
`SET search_path` ثابت آمن · مراجع كائنات مؤهلة بالكامل · المالك دور مخصص بلا تسجيل دخول ولا يساوي دور التطبيق · REVOKE EXECUTE FROM PUBLIC ثم GRANT للهوية المطلوبة فقط · تحقق صارم من المدخلات + المستأجر + الغرض + الحالة داخل الدالة · لا SQL ديناميكي ولا أسماء جداول/أعمدة من المستخدم · تسجيل كل استدعاء · ضوابط معدّل عند الحاجة.

## 4. AUTHORITY DOMAINS (لا Super-Broker)
سبع سلطات مستقلة، كل واحدة بهوية ومفتاح ونشر وسجل منفصل: UPLOAD CAPABILITY AUTHORITY · SCAN INPUT BROKER · SCAN RESULT INGESTION · DECISION AUTHORITY · EVIDENCE AUTHORITY · DELIVERY CAPABILITY AUTHORITY · SECURITY AUDIT AUTHORITY. لا سلطة تجمع read-all + write-all + mint-all + release-all.

## 5. CAPABILITY ISSUER COMPROMISE MODEL
كل قدرة تُصدَر فقط بالإشارة إلى سجل مصرّح قائم (Slot/Scan/Decision)، ولا تُبنى من `object_key` يرسله المنادي. كل قدرة تحمل: tenant · object · purpose · max TTL · nonce · audience · issuer · policy version · audit · rate limit. اختراق مُصدِر واحد لا يمنح قدرات على ملفات لا تملك سجلاً مصرّحاً.

## 6–8. UPLOAD_SLOT STATE MACHINE
ISSUED → CLAIMED → UPLOADING → UPLOADED → SEALED · وفروع EXPIRED / FAILED. حقول: slot_version, claim_id, attempt_id, expected_object_key, expected_tenant, expected size constraints, expires_at, claimed_at, sealed_at.
Race: **claim ذري قبل أي استخدام مميّز** (CAS على slot_version)، والختم بعد اكتمال الرفع؛ المطالِب الثاني يُرفض. Finalize يعيد التحقق من slot_id + object_key + organization_id + وجود الكائن فعلياً + الحجم + بيانات وصفية مشتقة من الخادم + generation/version إن توفر. لا يبدأ Scanner قبل SEALED.

## 9–11. DATABASE_COMPROMISE_CONTAINMENT_MODEL
بافتراض اختراق Postgres وحده (KMS/العمّال/المدقّق/المخزن سليمة): المهاجم يستطيع تزوير صفوف الحالة والنتائج والقرارات، ولا يستطيع توليد توقيعات صالحة. لذلك: **صف قاعدة البيانات ليس مصدر الحقيقة الأمنية**. الإفراج يشترط تحقق متزامن من: حالة DB + توقيع القرار + شهادة الأدلة + بصمة الملف + المستأجر + إصدار السياسة، مع jti/nonce ضد إعادة استخدام قرار قديم. تغيير DB وحده ⇒ NO RELEASE.
سلامة سجل التدقيق: hash-chain + ملخص موقّع بـKMS + نسخة خارجية غير قابلة للتعديل + **مدقّق دوري مستقل عن قاعدة التطبيق** يرفع SECURITY_AUDIT_INTEGRITY_ALERT عند انكسار السلسلة.

## 12–13. BROKER & STORAGE COMPROMISE
العامل يتلقى scan_id + file_id + tenant_id + expected_sha256 + قدرة كائن، ويعيد حساب SHA-256 بنفسه؛ عدم التطابق = INTEGRITY INCIDENT ورفض قبول أي نتيجة (يمنع Broker مخترقاً من تمرير ملف B تحت هوية A).
الإفراج يعيد حساب البصمة قبل التسليم؛ HASH_BEFORE_RELEASE ≠ APPROVED_HASH ⇒ حجب وحادث. القاعدة العامة: HASH_BEFORE_EVERY_SECURITY_TRANSITION. القرار مرتبط بالمحتوى لا بالمسار.

## 14–15. RETENTION SEMANTICS (مفصولة)
Quarantine immutability = قفل احتفاظ أمني **قصير** يغطي فترة الرفع→الفحص→القرار→الإفراج لمنع TOCTOU فقط. Evidence Vault retention = طويل حسب سياسة الأدلة. Legal retention = سياسة قانونية للمكتب. Tenant deletion = حذف المحتوى. حذف المستند التجاري لا يمس تاريخ القرارات والبصمات وأحداث التدقيق وبيانات الحوادث، مع عدم الاحتفاظ بمحتوى شخصي أكثر من اللازم: CONTENT_RETENTION منفصلة عن SECURITY_METADATA_RETENTION.

## 16–17. KEY HIERARCHY & ROTATION
هرمية: مفاتيح توقيع القرار والأدلة والسياسة KMS-backed غير قابلة للتصدير؛ الخدمات تطلب عملية SIGN ولا تقرأ بايتات المفتاح الخاص. لا بيئة تطبيق واحدة تحمل كل المفاتيح.
NORMAL_ROTATION: key_version + dual-read + نافذة تقاعد. EMERGENCY_COMPROMISE_ROTATION: إبطال فوري للمفتاح القديم، إبطال كل الرموز القائمة، إعادة إصدار الجلسات/التذاكر المتأثرة، تحديد السجلات المتأثرة، فتح حادث — بلا نافذة تسامح.

## 18. HIGH-RISK SECURITY POLICY CHANGE
تغيير المحركات المطلوبة أو قائمة الأنواع المسموحة أو حد عمر التواقيع أو اشتراط الصندوق الديناميكي أو سلوك الفشل أو متطلبات الأدلة أو سياسة الإفراج = عالي الخطورة: منشئ + معتمد مختلفان، MFA، سبب، diff، إصدار سياسة، حزمة سياسة موقّعة، فترة تهدئة عند الاقتضاء، تدقيق كامل.

## 19–20. تصحيح صياغة AI/OCR والادعاءات التنظيمية
EXTERNAL_THIRD_PARTY_DATA_EGRESS = OBSERVED_IN_CODE (إرسال إلى `ai.gateway.lovable.dev`) · PROCESSING_COUNTRY = NOT_PROVEN · DATA_RESIDENCY = NOT_PROVEN · PROVIDER_RETENTION = NOT_PROVEN · SUBPROCESSORS = NOT_PROVEN · TRAINING_USAGE = NOT_PROVEN · DPA = NOT_PROVEN. الحكم يبقى AI_OCR_EXTERNAL_DATA_FLOW_RISK = HIGH بسبب عدم الإثبات لا بسبب استنتاج جغرافي. **يُصحَّح CF-11 في السجل بهذه الصياغة.**
كل ادعاء تنظيمي (إقامة البيانات، انطباق NCA، متطلبات PDPL، الاحتفاظ) يُوسم: VERIFIED / UNVERIFIED / REQUIRES_COMPLIANCE_CONFIRMATION. الحالة الآن: كلها REQUIRES_COMPLIANCE_CONFIRMATION.

## 21–22. تصحيح CF-12 و CF-13
CF-12: BACKGROUND_JOB_CREATION_PATH / ACCEPTED_FILE_STATES / AUTHORIZATION / CREDENTIAL / DATA_OUTPUT = **NOT_PROVEN** (سُحب وصف INFERRED كحقيقة).
CF-13: CURRENT_CLEANUP_BLAST_RADIUS = **NOT_PROVEN** — يجب إثبات سطري لما يستطيع الـcron حذفه (Buckets، جداول، نطاق مستأجر، نطاق تاريخي، أنواع الآثار) قبل وصفه بأنه واسع.

## 23–24. P0_PRODUCTION_PARITY_MATRIX
مطابق: إصدار المخطط · فئة إعداد التخزين · نموذج RLS · إصدار وقت التشغيل · كود الأمن · إصدارات المحلّلات · صيغة حزمة السياسة.
مختلف عمداً: بيانات صناعية · أسرار ومفاتيح منفصلة · لا حسابات إنتاج · لا مستندات إنتاج · لا service role إنتاجي.
داخل P0 فقط تُثبت دلالات المزود: TTL رمز الرفع، إعادة الاستخدام، التزامن، سباق نفس المسار، upsert، القدرة المنتهية، الكتابة الفوقية، سياسات التخزين، versioning، الحذف، RLS. وثائق المزود وحدها لا تكفي.

## 25–26. Shadow & Lab Data
نتيجة Shadow لا تمنح Release أبداً؛ فشل Shadow لا يجعل ملفاً "نظيفاً". بيانات P0: ملفات صناعية سليمة، EICAR، صيغ مشوّهة صناعية، محاكاة قنابل آمنة، مجموعة fuzz آمنة — بلا مستندات عملاء وبلا عينات برمجيات خبيثة حقيقية خارج برنامج مختبر أمني منفصل.

## 27–28. Trust Domains للتخزين والمشتقات
QUARANTINE CREDENTIAL ≠ FINAL STORAGE CREDENTIAL · QUARANTINE WRITE AUTHORITY ≠ RELEASE WRITE AUTHORITY · الماسح بلا وصول للتخزين النهائي · الإفراج بلا تصفح حر للحجر.
كل معاينة: كائن مستقل بمعرّف وبصمة وحالة أمنية ونسب للأصل؛ لا تُكتب في مسار الأصل ولا تسمح باستبداله؛ أصل المعاينة لا يملك قدرة قراءة الأصل إلا عبر خدمة التحويل المخوّلة.

## 29. COMPLETE COMPROMISE MATRIX (مختصرة — لكل مكوّن: يكسب / لا يكسب / كشف / احتواء)
| المكوّن | يكسب | لا يكسب | كشف | احتواء |
|---|---|---|---|---|
| Application | واجهات المستخدم وطلبات مصرّحة | إفراج بلا 2-of-2، بايتات خام (بعد S5) | تدقيق + معدلات شاذة | هوية تطبيق بلا مفاتيح أمنية |
| Database | تزوير صفوف | توقيعات صالحة، إفراج | مدقّق سلسلة مستقل | التحقق المزدوج بالتوقيع |
| service-role legacy | كل التخزين/الجداول (اليوم) | — (لهذا CF-06) | تدقيق وصول | Service Identity Separation |
| Upload authority | إصدار قدرات لسجلات قائمة فقط | ملفات بلا Slot، مستأجر آخر | سجل إصدار | ربط سجل/مستأجر/كائن |
| Quarantine storage | كائنات محجوزة | التخزين النهائي، الأدلة | فروق البصمة | قفل احتفاظ + بصمة قبل كل انتقال |
| Scan broker | توجيه المدخلات | تزوير الهوية (يُكشف بالبصمة) | expected≠actual sha | رفض النتيجة + حادث |
| Structural/AV-A/AV-B/YARA/Sandbox/CDR | ملف واحد لكل عامل | DB/أسرار/شبكة/تخزين نهائي | نبضات + نتائج شاذة | عامل مؤقت بلا شبكة |
| Decision Engine | إصدار قرار زائف | إفراج (يحتاج الأدلة) | تعارض مع المدقّق | 2-of-2 |
| Evidence Verifier | شهادة زائفة | إفراج (يحتاج القرار) | تعارض | 2-of-2 |
| Release Service | تسليم ملف مُقرَّر واحد | صلاحية واسعة على Buckets | تدقيق تسليم | قدرة معنونة بالكائن |
| Final Storage | كائنات نهائية | تجاوز التحقق بالبصمة عند التسليم | hash قبل الإفراج | ربط القرار بالمحتوى |
| Preview Service | مشتقات | الأصل | نسب المشتقات | نطاق تحويل ضيق |
| Audit DB | سجلات | كسر السلسلة بلا كشف | مدقّق خارجي | نسخة غير قابلة للتعديل |
| KMS | توقيع (الأخطر) | — | مراقبة عمليات التوقيع | مفاتيح غير قابلة للتصدير + تدوير طارئ |
| Admin account | إجراءات إدارية | تغيير سياسة منفرداً | تدقيق + موافقة ثنائية | Two-person policy change |
| CI/CD | نشر كود | مفاتيح KMS الخاصة | تحقق توقيع الصور | صور مثبتة Digest |

## 30. COMPOUND COMPROMISE ASSUMPTIONS
2-of-2 لا يحمي إذا كان Decision و Evidence Verifier على نفس المضيف أو نفس مجال الأسرار. لذلك الافتراض المعلن: هويتان منفصلتان، مجالا نشر منفصلان، مفتاحا توقيع منفصلان، سجلان منفصلان. اختراق مشترك للاثنين = خارج نطاق الحماية ويُصرَّح به كمخاطرة متبقية معلنة.

## 31. تحديث سجل الاكتشافات
CF-01..CF-05 = OBSERVED_IN_CODE · CF-06, CF-07 = OBSERVED_IN_CODE · CF-08, CF-09, CF-10 = NOT_PROVEN · CF-11 = OBSERVED_IN_CODE للخروج فقط، وكل ما يخص الجغرافيا/الاحتفاظ NOT_PROVEN · CF-12 = NOT_PROVEN (مصحَّح) · CF-13 = NOT_PROVEN (مصحَّح).
اكتشافات جديدة: **CF-14** خطر تحوّل Broker موحّد إلى جذر ثقة جديد (تصميمي) · **CF-15** الاعتماد على صف DB كمصدر حقيقة للإفراج · **CF-16** غياب هرمية مفاتيح ومسار تدوير طارئ · **CF-17** غياب مدقّق سلامة تدقيق مستقل عن قاعدة التطبيق · **CF-18** غياب بيئة تحقق غير إنتاجية مماثلة (P0) · **CF-19** إمكانية إصدار قدرة من `object_key` يرسله المنادي.

## الناتج
CALL_GRAPH_COVERAGE = NOT_PROVEN (2/11)
FILE_OPERATION_SEARCH_COVERAGE = NOT_PROVEN (هدف: EVIDENCE_COMPLETE عبر جرد AST + حارس CI)
PUBLIC_MEDIA_WRITE_PATH_COVERAGE = NOT_PROVEN
ROOT_OF_TRUST_SEPARATION = DESIGNED
SERVICE_IDENTITY_SEPARATION = DESIGNED (7 سلطات مستقلة)
SECURITY_DEFINER_HARDENING_DESIGNED = YES
UPLOAD_SLOT_STATE_MACHINE_DESIGNED = YES
UPLOAD_RACE_CONTAINMENT_DESIGNED = YES (claim ذري قبل الاستخدام + ختم بعد الرفع)
DATABASE_COMPROMISE_CONTAINMENT_DESIGNED = YES
BROKER_COMPROMISE_CONTAINMENT_DESIGNED = YES (إعادة حساب SHA-256 داخل العامل)
STORAGE_COMPROMISE_CONTAINMENT_DESIGNED = YES (بصمة قبل كل انتقال أمني)
KMS_KEY_HIERARCHY_DESIGNED = YES (مشروط بتوفر KMS في البنية المختارة)
EMERGENCY_KEY_ROTATION_DESIGNED = YES
P0_PARITY_DESIGNED = YES
AI_OCR_DATA_RESIDENCY_STATUS = NOT_PROVEN (الخروج OBSERVED_IN_CODE؛ الجغرافيا والاحتفاظ والمعالجات الفرعية والتدريب وDPA = NOT_PROVEN) · REQUIRES_COMPLIANCE_CONFIRMATION
SINGLE_COMPONENT_MALICIOUS_RELEASE = NO (بالتصميم المستهدف) · YES (في الوضع الحالي قبل التنفيذ)
SINGLE_COMPONENT_ALL_DOCUMENT_EXPOSURE = NO (بالتصميم المستهدف) · YES اليوم عبر service_role (CF-06)
UNRESOLVED_CRITICAL_DESIGN_GAPS = آلية فصل هوية الخدمات الفعلية على Supabase · توفر KMS ومخزن Object Lock في بنية سعودية · دلالات قدرة الرفع لدى المزود · سيادة بيانات AI/OCR · تعريف نافذة قفل الاحتفاظ الأمني
UNRESOLVED_EVIDENCE_GAPS = 9/11 Call Graphs · جرد عمليات الملفات الكامل · مسارات كتابة الوسائط العامة · سلوك الرفع الموقّع · immutability التخزين · مسار إنشاء وظائف الخلفية · نطاق حذف الـcron · سياسات Buckets وقت التشغيل
BASE_ARCHITECTURE_V5 = FROZEN
ACR_01_REVISION_2_STATUS = READY_FOR_REVIEW
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR ACR-01 REVISION 2 SECURITY REVIEW

---

# MEHLA DOCUMENT SECURITY — FINAL CONSOLIDATED SECURITY PLAN (FREEZE CANDIDATE) · ACR-01 REVISION 3

المرجع الوحيد المستقبلي. لا تنفيذ/Migration/أسرار/تخزين/نشر/مختبر.

## 1. SUPERSESSION_MATRIX
| القاعدة القديمة | تُلغى بـ |
|---|---|
| Master Plan S1: جداول أمنية service_role only | ACR-01 R3 §2 — private security schema + هويات خدمة مخصصة ودوال ضيقة |
| Master Plan S0 → S1 مباشرة | ACR-01 R3 §35 — S0 EVIDENCE COMPLETE → ACR-01 FINAL → P0 DESIGN → P0 TESTS → S1 |
| S5 كمرحلة واحدة | S5A (إخراج التحقق البنيوي) ثم S5B (إخراج OCR/AI/secure-view) |
| "AV-B مطلوب حسب السياسة" (اختياري ضمناً) | AV-B إلزامي لمصادر EXTERNAL_UNTRUSTED (EP-09) |
| V5: Broker موحّد | ACR-01 R2 §4 — سبع سلطات مستقلة |
| R2 §13: HASH_BEFORE_EVERY_SECURITY_TRANSITION | R3 §14 — CONTENT_INTEGRITY_REVALIDATION_MATRIX |
| S0.5: تسمية PROVEN لتغطية غير مكتملة | ACR-01 §1 — مستويات ثقة صريحة |
| افتراض توفر Object Lock ضمناً | R3 §16–18 — قرار مزود بمعايير إثبات |
| Dependency graph القديم | R3 §35 |
CANONICAL_PLAN_CONFLICTS = 9 محلولة · 0 متبقية.

## 2. private security schema (بدل service_role only)
مخطط `security` غير مكشوف للـData API، بجداول: `upload_slots`, `secure_files`, `file_scans`, `file_scan_results`, `file_security_decisions`, `file_evidence_attestations`, `file_release_events`, `file_lineage`, `security_audit_events`, `file_ioc`, `policy_versions`.
منح لكل مكوّن (دوال فقط، لا وصول جدولي عام):
- Application: `request_upload_slot`, `claim_upload_slot`, `read_file_status` (مستأجره فقط).
- Upload Authority: `issue_upload_capability`, `finalize_slot` (UPLOADED→SEALED) — لا release.
- Scan Result Ingestion: `ingest_scan_result` (إدراج فقط، لا تعديل).
- Decision: `record_decision` (قراءة نتائج، لا بايتات).
- Evidence: `record_attestation` (قراءة أدلة موقّعة فقط).
- Release: `authorize_release` (يقرأ القرار+الشهادة، لا يكتب نتائج).
- Audit: قراءة append-only + تحقق سلسلة؛ لا حذف لأي مكوّن.

## 3. SUPABASE IDENTITY FEASIBILITY MATRIX (تصميمي)
| خيار | امتيازات DB | تخزين | RLS | عمر الاعتماد | تعرّض | نطاق مستأجر/كائن | إبطال | تدقيق | نطاق أثر | تعقيد |
|---|---|---|---|---|---|---|---|---|---|---|
| A) Custom Storage Roles + RLS | متوسط | جيد | يُطبَّق | طويل | متوسط | جيد/محدود | متوسط | جيد | متوسط | متوسط |
| B) أدوار PostgreSQL لكل خدمة | دقيق جداً | غير مباشر | يُطبَّق | طويل | مرتفع (كلمات مرور) | ممتاز | جيد | ممتاز | منخفض | مرتفع |
| C) Narrow SECURITY DEFINER RPC | محصور بالدوال | غير مباشر | مُتجاوَز داخل الدالة بضوابط | تابع للمنادي | منخفض | ممتاز | فوري | ممتاز | منخفض | متوسط |
| D) Backend capability broker | لا شيء مباشر | قدرات معنونة | خارج DB | قصير جداً | منخفض | ممتاز | فوري | ممتاز | منخفض | مرتفع |
| E) Hybrid (B+C+D) | — | — | — | — | — | — | — | — | الأدنى | الأعلى |
RECOMMENDED_SUPABASE_IDENTITY_MODEL = **E (Hybrid)**: أدوار Postgres مخصصة تملك الدوال، واجهة RPC ضيقة للتطبيق، وBroker قدرات للتخزين — مع بقاء كل عنصر NOT_PROVEN حتى P0.

## 4. SERVICE_ROLE_ELIMINATION_REGISTER
الهدف GENERAL_SERVICE_KEY_FILE_ACCESS = 0. الوحدات الملفّية ذات الأولوية (owner / purpose / replacement / phase / risk / status):
`documents/intake.server.ts` (رفع → Upload Authority · S4 · عالي · OPEN) · `secure-view/*` (معاينة → Preview Service · S14 · عالي · OPEN) · `email/attachments.server.ts` (مرفقات → Ingestion Broker · S4 · عالي · OPEN) · `office-page(.ops).server.ts` + `office-public.server.ts` (وسائط → Publish Gate · S23 · متوسط · OPEN) · `contracts/*` (PDF → Delivery Authority · S18 · متوسط · OPEN) · `hr.functions.ts` (EP-08 · S4 · متوسط · OPEN) · `secure-view/cleanup.server.ts` (EP-11 → Cleanup Authority محصورة · S20 · متوسط · OPEN) · `document-ai/ocr` (EP-10 → Scan-gated · S5B · عالي · OPEN) · باقي الوحدات غير الملفّية تُجرد في S0 الموسّع (NOT_PROVEN). أي بقاء مبرَّر: مؤقت + مُدرج + بتاريخ إزالة.

## 5. CLOUD_CONTROL_PLANE_COMPROMISE_MODEL
بافتراض اختراق حساب إدارة السحابة: يستطيع تعديل نشر Decision/Evidence، تغيير سياسة KMS، منح نفسه SIGN، تعطيل التدقيق، تعديل احتفاظ التخزين والشبكة، وقراءة الأسرار المدارة. لذلك: فصل حسابات/compartments بين مجال الأمن ومجال التطبيق، سياسات KMS بموافقة ثنائية، احتفاظ تدقيق غير قابل للحذف إدارياً خلال نافذته، تنبيه فوري على أي تغيير سياسة، ونسخة تدقيق في مجال إداري منفصل. مخاطرة متبقية معلنة: اختراق مدير السحابة الأعلى يبقى سيناريو كارثي يُخفَّف ولا يُلغى.

## 6–8. KMS · فصل الواجبات · Break-glass
مفاتيح منفصلة + سياسات IAM منفصلة + هويات عمل منفصلة + خزائن/compartments منفصلة حيث تسمح البنية. لا Principal واحد يوقّع بمفتاحي Decision وEvidence في التشغيل الطبيعي ⇒ COMPROMISE_DECISION_SIGNING ≠ COMPROMISE_EVIDENCE_SIGNING.
SEPARATION_OF_ADMINISTRATIVE_DUTIES: Platform Admin · Security Admin · KMS Admin · Deployment Admin · Audit Admin — لا شخص يجمع تعديل Decision + تعديل Evidence + منح SIGN بلا موافقة إضافية.
Break-glass: هوية معطّلة بلا جلسة قائمة، MFA قوي، سبب إلزامي، مدة محددة، تنبيه فوري، تدقيق كامل، مراجعة بعد الحدث؛ ممنوع كحساب تشغيل.

## 9–11. CI/CD كجذر ثقة
افتراض اختراق كامل للـPipeline: يستطيع تغيير Decision وEvidence معاً وكسر 2-of-2 رغم مفاتيح KMS غير القابلة للتصدير. الضوابط: DECISION_DEPLOYMENT_AUTHORITY ≠ EVIDENCE_DEPLOYMENT_AUTHORITY، وإن تعذّر: اعتماد نشر مستقل لكل خدمة + توقيع الأثر + فروع محمية + CODEOWNERS أمني + provenance غير قابل للتغيير + admission verification + موافقة شخصين للخدمات الأمنية.
كل أثر إنتاجي أمني: pinned digest · signed · SBOM · provenance · dependency lock · نتيجة فحص ثغرات · commit SHA. وقت التشغيل يرفض أي صورة غير معتمدة.
HIGH_RISK_SECURITY_CHANGE: Decision · Evidence · Release · Scan broker · Policy evaluator · تكامل KMS · كود انتقالات الحالة.

## 12–13. AUDIT_INDEPENDENCE_DOMAIN
هوية وصلاحيات منفصلة، احتفاظ غير قابل للتعديل، لا حذف من التطبيق أو الماسح أو Decision/Evidence، وفصل الحساب/compartment الإداري حيث كان عملياً. عند توقف المدقّق أو اكتشاف فجوة سلسلة/عدم تطابق توقيع/تسلسل مفقود: تنبيه + حادث + `SECURITY_STATE = DEGRADED`. Severity عالية (كسر سلسلة أو توقيع) ⇒ إيقاف الإفراج؛ توقف مؤقت للمدقّق ⇒ استمرار مع تنبيه ومهلة قصوى ثم إيقاف. لا فشل تدقيق صامت.

## 14–15. CONTENT_INTEGRITY_REVALIDATION_MATRIX
البصمة المرجعية تُثبّت عند حد SEALED. إعادة الحساب إلزامية عند: أول قراءة في المنطقة العدائية · إنشاء أي مشتق · النسخ إلى التخزين النهائي · قبل أول إفراج · إعادة تصنيف حساسة للسلامة · أي عبور حدود ثقة. انتقالات الحالة الوصفية لا تتطلب تنزيلاً كاملاً ما دام ربط Generation/Version قائماً ⇒ حماية TOCTOU بلا SELF_INDUCED_HASHING_DOS.
ربط الإصدار: ETag/generation/version id تُخزَّن مع sha256 وobject_key وslot وscan وdecision. **ETag ليس بديلاً عن SHA-256** إلا بإثبات صريح من المزود.

## 16–19. QUARANTINE_PROVIDER_DECISION_RECORD
معايير كل مرشح: توفر منطقة سعودية الآن · Object Storage · retention/WORM أصلي · immutability · شبكة خاصة · دقة IAM · مفاتيح مُدارة من العميل · سجلات تدقيق · التوفرية · SDK · التكلفة · التعقيد التشغيلي.
- **OCI Saudi Arabia Central (Riyadh)**: OCI_QUARANTINE_CANDIDATE = STRONG_CANDIDATE · OCI_FINAL_FEASIBILITY = NOT_PROVEN (يتطلب إثبات retention في المستأجر/المنطقة المختارة، Vault/KMS، عزل الحوسبة، الشبكة الخاصة، السجلات، السعة).
- مرشحون آخرون (سحابات محلية/إقليمية): CURRENTLY_UNAVAILABLE / NOT_PROVEN — لا يُبنى على منطقة معلنة مستقبلاً.
- Supabase وحده: application-enforced فقط ⇒ غير كافٍ كهدف نهائي، مقبول كمرحلة انتقالية فقط.
الهدف الحقيقي = **IMMUTABLE_BYTES_DURING_SECURITY_WINDOW**؛ Versioning ضابط مستقل قد يكون SUPPORTED / INCOMPATIBLE / UNNECESSARY حسب المزود، ولا يُشترط اقترانه بـObject Lock.
صيغة نافذة القفل: `lock = max_scan_time + queue_delay_p99 + detonation_time + CDR_time + rescan_time + decision_time + release_reconciliation + safety_buffer`، تُشتق من قياسات P0 وتُراجَع مع كل تغيير سياسة — لا رقم تخميني الآن.

## 20–22. UPLOAD SLOT — تصحيح الحقائق والسلطة
SIGNED_UPLOAD_PROVIDER_TTL = DOCUMENTED_BY_PROVIDER = 2 hours · ONE_TIME_SEMANTICS / REPLAY_BEHAVIOR / CONCURRENCY_BEHAVIOR = NOT_PROVEN حتى P0. TTL مِهلة مستقل وأقصر، وهو الحاكم.
أي كائن يصل بعد انتهاء الـSlot أو بعد مطالبة طرف آخر = ORPHAN / REJECTED ولا يبلغ الإفراج أبداً.
UPLOADED → SEALED بيد **Finalize Authority** فقط (لا العميل)، تتحقق من الكائن والحجم والمستأجر والمفتاح والإصدار؛ ولا تملك أي صلاحية release. اختراقها = ختم كائن غير مطابق ⇒ يُكشف بإعادة حساب البصمة في المنطقة العدائية وبقرار 2-of-2.

## 23–27. سلامة النتائج والسياسات والمفاتيح والوقت
SCAN RESULT INGESTION تقبل فقط: هوية محرك معروفة + ربط بالوظيفة + scan_id + file_id + tenant + expected hash + إصدار المحرك + إصدار القواعد + إصدار السياسة + طابع زمني + nonce + مخطط نتيجة صارم. ترفض: محرك مجهول، نتيجة مكررة متعارضة، وظيفة/مستأجر/بصمة خاطئة، وظيفة قديمة، إعادة إرسال.
Result replay: NEW SECURITY CONTEXT = NEW DECISION؛ لا HASH_CACHE = AUTOMATIC CLEAN؛ إعادة استخدام أدلة فقط إن سمحت السياسة وكانت إصدارات المحركات/القواعد حالية وفئة الثقة متوافقة مع تسجيل النسب.
POLICY_ROLLBACK_PROTECTION: كل متحقق يقارن بـ CURRENT_MINIMUM_POLICY_VERSION لا بما في الرمز فقط.
Key rollback: سجل مفاتيح نشطة + سجل ملغاة + not-before/not-after + kid؛ مفتاح متقاعد أو مُبطَل طارئاً لا يُقبل أبداً.
Clock: NTP غير متاح / انحراف / رجوع / قفزة أمامية ⇒ Fail-Closed؛ لا رمز منتهٍ يصبح صالحاً بسبب خطأ وقت.

## 28–29. P0_IDENTITY_ISOLATION_TEST_MATRIX
Scanner لا يستعلم DB · Decision لا يقرأ التخزين · Evidence لا يقرأ بايتات خام · Release لا يسرد Bucket · Upload Authority لا تنزّل · Audit Authority لا تُفرِج · Application لا تستدعي دوال مالك الأمن مباشرة. وحدود IAM: هوية خدمة خاطئة، دور خاطئ، audience خاطئ، رمز عبر خدمات، اعتماد مُبطَل، اعتماد منتهٍ، محاولة تصعيد ⇒ المتوقع DENY في كل حالة.
P0_PRODUCTION_PARITY كما في R2 §23.

## 30–33. حالة الأدلة
CALL_GRAPH: 2/11 (EP-01, EP-02) — الباقي يتطلب قراءة سطرية موسّعة لم تُنجَز في هذه البوابة ⇒ NOT_PROVEN.
FILE_OPERATION_SEARCH: بحث نصي واسع أُجري (upload/download/copy/move/remove/signed/public/buffer/formdata) لكن Wrappers والاستيرادات المُسمّاة لم تُغطَّ بجرد AST ⇒ NOT_PROVEN.
PUBLIC_MEDIA: NOT_PROVEN.
BACKGROUND WORKER (EP-10): BACKGROUND_JOB_CREATION_PATH / ACCEPTED_FILE_STATES / AUTHORIZATION / CREDENTIAL / DATA_OUTPUT = **NOT_PROVEN**.
CRON (EP-11): CURRENT_CLEANUP_BLAST_RADIUS = **NOT_PROVEN** (الجداول والBuckets وعمليات الحذف ومعايير الأهلية وفحوص المستأجر والزمن غير مثبتة سطرياً).
AI/OCR EVIDENCE REGISTER — أسئلة إثبات مستقبلية، كلها NOT_PROVEN حتى مصدر رسمي/عقد: موقع المعالجة · إقامة البيانات · مدة الاحتفاظ · الاستخدام في التدريب · المعالجون الفرعيون · DPA · التشفير · الحذف · الإشعار بالحوادث.

## 36. TARGET vs CURRENT (ثوابت مختارة)
| الثابت | TARGET | CURRENT |
|---|---|---|
| SINGLE_COMPONENT_ALL_DOCUMENT_EXPOSURE | NO | **YES** (service_role) |
| SINGLE_COMPONENT_MALICIOUS_RELEASE | NO | **YES** (لا بوابة إفراج) |
| UNTRUSTED_BYTES_IN_MAIN_APP | 0 | **>0** |
| QUARANTINE_EXISTS | YES | **NO** |
| DIRECT_SECURITY_STATE_UPDATE | 0 | لا توجد حالة أمنية أصلاً |
| MULTI_ENGINE_MALWARE_DETECTION | VERIFIED | **NONE** |
| AUDIT_TAMPERING_DETECTABLE | YES | جزئي |
| SECRET_DOMAIN_SEPARATION | YES | **NO** (CF-07) |

## 37. COMPROMISE MATRIX V2 — إضافات
| المكوّن | يكسب | لا يكسب | منع | كشف | احتواء | استرجاع | أقصى نطاق |
|---|---|---|---|---|---|---|---|
| Cloud account admin | نشر/سياسات/أسرار مُدارة | مفاتيح غير قابلة للتصدير خارج مجاله | فصل حسابات + موافقة ثنائية | تنبيه تغيير سياسة | مجال تدقيق مستقل | استعادة من مجال منفصل | كارثي (مخاطرة معلنة) |
| KMS policy admin | منح SIGN | التوقيع بلا منح مرصود | فصل KMS Admin | سجل عمليات المفاتيح | تدوير طارئ | إعادة إصدار مفاتيح | مرتفع |
| Deployment pipeline | كود الخدمات | مفاتيح خاصة | سلطتا نشر منفصلتان | provenance/admission | تجميد النشر | إعادة نشر موقّعة | مرتفع |
| GitHub/repo admin | المصدر | نشر بلا موافقة | CODEOWNERS + فروع محمية | مراجعة التغيير | إبطال الأثر | rollback موقّع | مرتفع |
| Upload finalize authority | ختم كائن غير مطابق | إفراج | فصل الصلاحية | إعادة حساب البصمة | رفض 2-of-2 | إعادة فحص | متوسط |
| Scan result ingestion | إدخال نتيجة زائفة | تعديل نتائج سابقة | مخطط صارم + nonce | تعارض المحركات | رفض القرار | إعادة فحص | متوسط |
| Capability signer | قدرات لسجلات قائمة | قدرات لملفات بلا سجل | ربط سجل/مستأجر/كائن | سجل إصدار | إبطال kid | تدوير | متوسط |
| Independent audit verifier | إنكار/إنذار كاذب | تعديل السجل | صلاحية قراءة فقط | تناقض مع النسخة | تجاهل مؤقت موثّق | استبدال المدقّق | منخفض |
| DNS/domain control | إعادة توجيه واجهات | اعتماد قاعدة البيانات | HSTS + تثبيت الشهادات + نطاق كوكيز | مراقبة الشهادات/DNS | إبطال الشهادات | استرجاع النطاق | مرتفع |

## 38. DNS/DOMAIN
TLS إلزامي + مراقبة شفافية الشهادات + HSTS + كوكيز جلسة مقصورة على أصل التطبيق و**ممنوعة على أصل المعاينة** + قائمة أصول مسموحة + مراقبة تغييرات DNS. اختراق DNS لا يمنح اعتمادات قاعدة البيانات.

## 39. EVIDENCE PACK (تحديث للجهة الفاحصة الخارجية)
يضاف: مصفوفة هويات الخدمات · فصل KMS · مصفوفة IAM · نموذج تهديد مستوى تحكم السحابة · provenance للـCI/CD · سباقات Upload Slot · سلوك المزود وقت التشغيل · immutability الحجر · مصفوفة تماثل P0 · مصفوفة الاختراق V2.

## 35. FINAL DEPENDENCY GRAPH
```text
S0 EVIDENCE COMPLETE → ACR-01 FINAL → P0 DESIGN APPROVED → P0 CREATED (بموافقة صريحة)
→ P0 PROVIDER/IDENTITY TESTS → S1 → S2 … S30 → ENFORCEMENT → CANARY
```
لا تنفيذ تلقائي في أي حلقة.

## الناتج
S0_CALL_GRAPH_COVERAGE = 2/11 (NOT_PROVEN)
S0_FILE_OPERATION_COVERAGE = NOT_PROVEN (بحث نصي واسع؛ جرد AST مطلوب)
S0_PUBLIC_MEDIA_COVERAGE = NOT_PROVEN
CANONICAL_PLAN_CONFLICTS = 0 متبقية (9 مُلغاة في SUPERSESSION_MATRIX)
SUPABASE_IDENTITY_MODEL = HYBRID (أدوار Postgres + RPC ضيقة + Capability Broker) — DESIGNED, NOT_PROVEN
SERVICE_ROLE_ELIMINATION_DESIGNED = YES (سجل الإزالة مفتوح)
CLOUD_CONTROL_PLANE_CONTAINMENT_DESIGNED = YES (مع مخاطرة متبقية معلنة)
KMS_COMMON_MODE_FAILURE_REDUCED = YES (مفاتيح/سياسات/هويات/خزائن منفصلة)
CI_CD_COMMON_MODE_FAILURE_REDUCED = YES (سلطتا نشر + توقيع أثر + موافقة شخصين)
AUDIT_ADMINISTRATIVE_INDEPENDENCE_DESIGNED = YES
QUARANTINE_PROVIDER_FEASIBILITY = NOT_PROVEN
OCI_RIYADH_FEASIBILITY = STRONG_CANDIDATE / NOT_PROVEN
KMS_FEASIBILITY = NOT_PROVEN
MICROVM_FEASIBILITY = NOT_PROVEN
SIGNED_UPLOAD_PROVIDER_TTL = DOCUMENTED_BY_PROVIDER = 2 hours (ليست سياسة مِهلة)
SIGNED_UPLOAD_ONE_TIME = NOT_PROVEN
SIGNED_UPLOAD_REPLAY = NOT_PROVEN
P0_IDENTITY_TESTS_DESIGNED = YES
P0_PROVIDER_TESTS_DESIGNED = YES
UNRESOLVED_CRITICAL_DESIGN_GAPS = نموذج هوية Supabase غير مُثبت · مزود حجر بـimmutability أصلية · توفر KMS وMicroVM في الرياض · نافذة القفل تحتاج قياسات · سيادة بيانات AI/OCR
UNRESOLVED_CRITICAL_EVIDENCE_GAPS = 9/11 Call Graphs · جرد عمليات الملفات (AST) · مسارات كتابة الوسائط العامة · سلوك الرفع الموقّع · immutability التخزين · مسار وظائف الخلفية · نطاق حذف الـcron · سياسات Buckets وقت التشغيل · سجل مزود AI/OCR
UNPROVEN_INFRASTRUCTURE_ASSUMPTIONS = Object Lock · Versioning · KMS غير قابل للتصدير · MicroVM · شبكة خاصة · سلطتا نشر منفصلتان · فصل حسابات سحابية
BASE_ARCHITECTURE_V5 = FROZEN
ACR_01_FINAL_STATUS = READY_FOR_FINAL_REVIEW (مشروط بإغلاق فجوات أدلة S0)
CANONICAL_PLAN_READY_FOR_FINAL_REVIEW = YES
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR FINAL PRE-IMPLEMENTATION SECURITY REVIEW

---

# ACR-01 R4 — FINAL PRE-IMPLEMENTATION SECURITY GATE (ملحق للوثيقة الموحدة)

لا تنفيذ/Migration/P0/تخزين/أسرار/نشر.

## 1–2. FINAL_STORAGE_INTEGRITY_MODEL
التخزين النهائي content-addressed: مفتاح الكائن يشتق من `sha256` (+ مساحة مستأجر)، بلا كتابة فوقية في المكان، مع ربط version/generation حيث يدعمه المزود. كل قرار أمني يشير إلى: الكائن بعينه + الإصدار/الجيل + sha256 + المستأجر + إصدار السياسة. أي محتوى جديد = كائن/إصدار جديد ⇒ سياق أمني جديد ⇒ قرار جديد. تغيّر الجيل/الإصدار بعد القرار ⇒ NO DELIVERY. `PREVIOUSLY_RELEASED = TRUSTED FOREVER` مرفوض صراحةً.
الحماية المطلوبة: content-addressed append-only + version-bound no-overwrite كحدّ أدنى إلزامي، وimmutability أصلية مفضّلة عند توفرها. الهدف POST_RELEASE_OBJECT_REPLACEMENT_WITHOUT_RESCAN = 0.

## 3. DELIVERY_INTEGRITY_VERIFICATION_MODEL
ممنوع بثّ البايتات ثم كشف عدم تطابق البصمة. القاعدة: التحقق قبل البث، وبأرخص إثبات كافٍ:
- المسار السريع (الافتراضي): تطابق version/generation + immutability المُثبتة ⇒ لا حاجة لإعادة قراءة كاملة لكل تنزيل.
- إعادة حساب كامل قبل البث: عند غياب ربط الإصدار، أو أول إفراج، أو بعد أي إعادة تصنيف، أو عند تغيّر الوسم/الحجم، أو عيّنة عشوائية دورية.
- ملفات كبيرة: تحقق تدريجي بشجرة بصمات (Merkle) محسوبة عند SEALED، فيُتحقق من كل مقطع قبل إرساله بلا تحميل كامل مسبق.
هذا يوازن الأمن والزمن ويمنع SELF_INDUCED_HASHING_DOS.

## 4–5. SIGNED POLICY REGISTRY + MONOTONIC FLOOR
سجل سياسات موقّع خارج سلطة قاعدة البيانات: حزمة سياسة موقّعة بـKMS تحمل policy id · version · minimum accepted version · signature · not-before · status. كل من Decision/Evidence/Release/Policy Verifier يتحقق من التوقيع لا من صف قابل للتعديل. اختراق DB وحده لا يخفّض السقف.
MONOTONIC_SECURITY_POLICY_FLOOR: الحد الأدنى لا يتراجع أبداً؛ أي تراجع شرعي يتطلب إجراء طوارئ صريحاً + موافقة ثنائية + تفويض تراجع موقّع + سبب + تدقيق. ممنوع إعادة استخدام رقم إصدار بعد تغيّر المحتوى.

## 6–7. SIGNING_KEY_TRUST_REGISTRY_MODEL
مصدر الحقيقة لحالة المفاتيح = حالة KMS + بيانات ثقة موقّعة، لا صفوف DB. لكل مفتاح: kid · not-before · not-after · status (active/retired/revoked). اختراق DB لا يُعيد صلاحية مفتاح مُبطَل.
الانتشار: كل متحقق يجلب سجل الثقة بفاصل قصير محدد بالسياسة، مع Cache TTL قصير و`stale-if-error` **ممنوع** للعمليات الحرجة: إن تعذّر معرفة حالة المفتاح أو تجاوز السجل عمره الأقصى ⇒ FAIL CLOSED (لا إفراج، لا قبول توقيع). الإبطال الطارئ يُدفع فوراً لكل المتحققين ويُسجَّل كحادث.

## 8–10. CI/CD تقسية إضافية
شهادتا أثر مستقلتان: Decision artifact attestation وEvidence artifact attestation بسلطتي توقيع/اعتماد منفصلتين؛ الـAdmission لا يشغّل أي أثر أمني لا يحقق سياسة النشر (توقيع + provenance + digest مثبت). موافقة شخصين + توقيع أثر مستقل + تحقق provenance + فصل هوية النشر.
Invariant: ONE_DEPLOYMENT_CREDENTIAL_CAN_MODIFY_BOTH_DECISION_AND_EVIDENCE = 0. إن لم تدعم البنية ذلك ⇒ UNPROVEN_INFRASTRUCTURE_ASSUMPTION، ولا يُدّعى تقليل الفشل المشترك كاملاً.
كل أثر أمني (Decision · Evidence · Release · Scan Broker) مرتبط بـ: commit المصدر · قفل التبعيات · هوية الباني · طابع البناء · SBOM · provenance · digest · توقيع. أثر لا يُرجَع لمصدر معروف ⇒ DENY DEPLOYMENT.

## 11–12. DNS و PREVIEW_ORIGIN_COMPROMISE_MODEL
DNS: MFA على المُسجِّل · قفل النطاق · DNSSEC إن دعمه المزود والنطاق · سجل CAA · مدير DNS منفصل · تنبيهات التغيير · شهادات wildcard إلى أدنى حد · مراقبة CT. HSTS وحدها لا تحمي من اختراق DNS.
أصل المعاينة: **لا كوكيز تطبيق ولا كوكيز جلسة عليه أبداً** · كوكيز host-only + SameSite=Strict على أصل التطبيق · لا wildcard domain للكوكيز · CORS بقائمة أصول صريحة · CORP/COEP · CSP صارمة بلا سكربت خارجي · `postMessage` بأصل هدف محدد وتحقق من المُرسِل · `rel=noopener` ومنع `window.opener` · `Referrer-Policy: no-referrer` · `nosniff` + Content-Type صارم. اختراق نطاق المعاينة لا يمنح: كوكيز جلسة، اعتماد API، اعتماد DB، سلطة على الملف الأصلي، وصولاً عبر المستأجرين.

## 13. سياسة تدهور التدقيق (تفريق صريح)
AUDIT INTEGRITY FAILURE (عدم تطابق بصمة/توقيع، أحداث مفقودة، فجوة تسلسل) ⇒ **IMMEDIATE RELEASE FREEZE** + حادث. AUDIT VERIFIER AVAILABILITY FAILURE ⇒ نافذة سماح محددة بالسياسة مع تنبيه، وبعد انتهائها RELEASE FREEZE. لا خلط بين الحالتين ولا فشل صامت.

## 14. ADMINISTRATIVE COMMON-MODE TEST (لـP0 لاحقاً)
اختبار: هل حساب إداري واحد يستطيع تعديل Decision + تعديل Evidence + تغيير سياسات KMS + تعطيل التدقيق + تعديل الاحتفاظ + نشر الخدمتين؟ المتوقع في الوضع النهائي: NO إلا عبر مسار break-glass مُدقَّق.

## 15–20. حالة الأدلة (بصدق، بلا تخمين)
- CALL GRAPH 11/11: لم يُنجَز في هذه البوابة. المكتمل 2/11 (EP-01, EP-02). السبب ليس نقص صلاحية بل أن الإغلاق يتطلب قراءة سطرية موسّعة لعشرات الملفات لم تُنفَّذ هنا ⇒ **NOT_PROVEN (PENDING_READ_ONLY_ANALYSIS)**، وهي أول مهمة قبل أي موافقة تنفيذ.
- FILE OPERATION INVENTORY: بحث نصي واسع مُنفَّذ (upload/download/copy/move/remove/signed/public/buffer/formdata) وأنتج قائمة السطح في §2 من ACR-01؛ Wrappers والاستيرادات المُسمّاة غير مغطاة ⇒ NOT_PROVEN. `AST_GUARDRAIL = FUTURE_IMPLEMENTATION` (لا يُنشأ الآن لأنه تغيير كود).
- PUBLIC MEDIA: السلسلة معروفة بالملفات (`office-page.server.ts` → `office-page.ops.server.ts` → نشر → `office-public.server.ts:readPublishedMedia` → `routes/api/public/office/media/$.ts`) لكن التتبع السطري للاستبدال/الحذف/التنظيف لم يُنجَز ⇒ NOT_PROVEN.
- BACKGROUND WORKER (EP-10): كل البنود (مسار إنشاء الوظيفة، الحالات المقبولة، التفويض، فحص المستأجر، الاعتماد، الوصول للتخزين، المعالجة الخام، جهة الشبكة، البيانات الخارجة) = **NOT_PROVEN**. CF-12 يبقى NOT_PROVEN بلا ترقية.
- CRON CLEANUP (EP-11): المُثبت OBSERVED_IN_CODE: نقطة الدخول `routes/api/public/hooks/cleanup-secure-artifacts.ts` محمية بـ`guardCronRequest` (سرّ cron خاص) وتنادي `runSecureArtifactCleanup` في `secure-view/cleanup.server.ts` عبر heartbeat؛ الوصف الوظيفي: تنظيف تذاكر العلامة المائية المنتهية وآثارها المؤقتة. أما الجداول والBuckets وعمليات الحذف الفعلية ومعايير الأهلية وفحوص المستأجر/الزمن وقدرة حذف كائنات نشطة أو أدلة/تدقيق ⇒ **NOT_PROVEN** (يتطلب قراءة `cleanup.server.ts` سطرياً). CURRENT_CLEANUP_BLAST_RADIUS = NOT_PROVEN.
- BUCKET POLICY EVIDENCE: لم تُنفَّذ قراءات DB/Storage metadata في هذه البوابة (خارج نطاق المراجعة التصميمية المصرّح بها) ⇒ **BLOCKED_BY_SCOPE** لكل من documents / email-attachments / office-media-draft / office-public-media. لا تخمين.

## 21–23. ثوابت باقية
جدول TARGET vs CURRENT (§36 من الوثيقة الموحدة) يبقى دائماً حتى بعد التجميد.
قرارات البنية تبقى شرطية: OCI Riyadh = STRONG_CANDIDATE (ليست SELECTED/VERIFIED) حتى إثبات retention الكائنات، Vault/KMS، فصل IAM، الشبكة الخاصة، السجلات، عزل الحوسبة، السعة، والتوفر التجاري للمستأجر. وكذلك MicroVM وKMS ومجالا النشر المنفصلان.
AI_DATA_GOVERNANCE_GATE: تمكين OCR/AI على ملفات قانونية مُفرَجة يشترط إحدى الحالات: APPROVED_PROVIDER · SAUDI_PROCESSING · TENANT_OPT_IN، وإلا FEATURE_DISABLED. قرار الإقامة لا يعيق تصميم خط الحماية من البرمجيات الخبيثة.

## الناتج
S0_CALL_GRAPH_COVERAGE = 2/11 — NOT_PROVEN (PENDING_READ_ONLY_ANALYSIS)
S0_FILE_OPERATION_COVERAGE = NOT_PROVEN (AST_GUARDRAIL = FUTURE_IMPLEMENTATION)
S0_PUBLIC_MEDIA_COVERAGE = NOT_PROVEN
BACKGROUND_WORKER_EVIDENCE = NOT_PROVEN
CRON_CLEANUP_EVIDENCE = جزئي — نقطة الدخول والحماية OBSERVED_IN_CODE · نطاق الحذف NOT_PROVEN
BUCKET_POLICY_EVIDENCE = BLOCKED_BY_SCOPE
FINAL_STORAGE_INTEGRITY_MODEL_DESIGNED = YES
POST_RELEASE_OBJECT_REPLACEMENT_PROTECTED = DESIGNED (TARGET = 0 · CURRENT = غير محمي)
POLICY_ROLLBACK_PROTECTION_DESIGNED = YES
SIGNED_POLICY_REGISTRY_DESIGNED = YES
SIGNING_KEY_TRUST_REGISTRY_DESIGNED = YES
KEY_REVOCATION_PROPAGATION_DESIGNED = YES (FAIL CLOSED عند سجل قديم/غير متاح)
CI_CD_TWO_DOMAIN_DEPLOYMENT_DESIGNED = YES (مشروط بدعم البنية ⇒ UNPROVEN_INFRASTRUCTURE_ASSUMPTION)
PREVIEW_ORIGIN_COMPROMISE_CONTAINED = DESIGNED
AUDIT_INTEGRITY_FAIL_CLOSED_DESIGNED = YES (تجميد فوري للإفراج عند فشل السلامة · نافذة سماح للتوفر فقط)
UNRESOLVED_CRITICAL_DESIGN_GAPS = دعم البنية لمجالي نشر منفصلين · توفر KMS/Vault وMicroVM وObject retention في الرياض · نموذج هوية Supabase غير مُثبت · قياس نافذة القفل الأمني · بوابة حكامة بيانات AI/OCR
UNRESOLVED_CRITICAL_EVIDENCE_GAPS = 9/11 Call Graphs · جرد عمليات الملفات · مسارات كتابة الوسائط العامة · وظائف الخلفية · نطاق حذف الـcron · سلوك الرفع الموقّع · immutability التخزين · سجل مزود AI/OCR
BLOCKED_BY_ACCESS = سياسات Buckets وبيانات التخزين الوصفية (BLOCKED_BY_SCOPE في هذه البوابة) · إثبات قدرات مزود البنية السعودية (يتطلب حساباً/عقداً)
CANONICAL_PLAN_CONFLICTS = 0
BASE_ARCHITECTURE_V5 = FROZEN
ACR_01_R4_STATUS = DESIGN_CLOSED · EVIDENCE_OPEN
CANONICAL_PLAN_FINAL_STATUS = FREEZE_CANDIDATE — التصميم مغلق، والتجميد النهائي مشروط بإغلاق فجوات أدلة S0
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR FINAL IMPLEMENTATION DECISION

---

# MEHLA DOCUMENT SECURITY — FINAL PRE-IMPLEMENTATION EVIDENCE REPORT (READ-ONLY)

SNAPSHOT: repo مِهلة · فرع العمل الحالي · SNAPSHOT_SHA = `fae672ba2439` · Supabase Project ID = xklzpjocsiadnoglwryw · 2026-08-20 01:25 UTC. SNAPSHOT_CHANGED_DURING_REVIEW = YES (كان `29caf4fb70b2` في S0/S0.5) ⇒ أدلة هذا التقرير تُنسب إلى `fae672ba2439` فقط ولا تُخلط مع أدلة اللقطة السابقة.

## ما أُغلق فعلياً في هذه البوابة (OBSERVED_IN_CODE)
- **Service role**: عدد الوحدات في `src` التي تستورد `client.server` أو تقرأ `SUPABASE_SERVICE_ROLE_KEY` = **62**. تصنيف "الملفّية" منها لم يُحسب سطرياً ⇒ FILE_RELATED_SERVICE_ROLE_IMPORTS = NOT_PROVEN.
- **Insecure secret fallbacks**: العدد النهائي = **3**، وهي حصراً: `client-portal/portal-auth.server.ts:14` (`SERVICE_ROLE_KEY || "mehla-portal-secure-salt-2026"`) · `sms/otp.server.ts:119` (`MEHLA_BLIND_INDEX_KEY_V1 ?? SERVICE_ROLE_KEY ?? ""`) · `contracts/contracts.server.ts:74` (`SERVICE_ROLE_KEY || SUPABASE_URL || ""`). لم تُصلَح.
- **Cron cleanup (EP-11)** من `secure-view/cleanup.server.ts`: يعمل بـ`supabaseAdmin`؛ الجداول الممسوسة = `document_access_tokens` (DELETE بشرط `expires_at < cutoff`) و`documents` (قراءة لتحديد الكائنات اليتيمة)؛ التخزين = `storage.from(STORAGE_BUCKET)` مع `list` بترقيم صفحات و`remove` على دفعات؛ الأهلية = انتهاء الصلاحية أو كائن بلا صف مرتبط؛ **لا مرشّح مستأجر (tenant filter) في الحذف** ⇒ النطاق على مستوى المستودع لا المكتب. الجداول الأمنية/الأدلة غير موجودة أصلاً اليوم فلا تُمَس. CURRENT_CLEANUP_BLAST_RADIUS = حذف رموز وصول منتهية + كائنات آثار مؤقتة/يتيمة على مستوى المستودع بلا حصر مستأجر (OBSERVED_IN_CODE)؛ قدرة حذف كائنات نشطة تعتمد على دقة منطق "اليتيم" ⇒ هذا الجزء NOT_PROVEN.

## ما لم يُغلق (بصراحة، بلا تخمين)
- CALL_GRAPH: 2/11 فقط (EP-01 رفع داخلي، EP-02 رابط العميل). الحلقات المطلوبة لـEP-03..EP-11 بمستوى ملف+دالة+سطر لم تُقرأ في هذه البوابة ⇒ NOT_PROVEN.
- FILE_OPERATION_INVENTORY: بحث نصي واسع أُنجز وأنتج قائمة السطح، لكن تتبّع Wrappers إلى العملية النهائية وجدول (Operation ID / caller / wrapper chain / bucket / credential / tenant check) لم يُبنَ ⇒ NOT_PROVEN. AST_GUARDRAIL = FUTURE_IMPLEMENTATION (لم يُنشأ، لأنه تغيير كود).
- PUBLIC_MEDIA: NOT_PROVEN (سلسلة draft→publish→public معروفة بالملفات فقط).
- BACKGROUND_WORKER (EP-10): كل البنود NOT_PROVEN. CURRENT_BACKGROUND_PROCESSOR_SECURITY_GATE = **ABSENT** بدلالة غير مباشرة قوية (لا توجد أعمدة/جداول حالة أمنية في المخطط) لكن مسار إنشاء الوظيفة والاعتماد والحالات المقبولة NOT_PROVEN.
- OCR/AI: المعروف OBSERVED_IN_CODE أن `ocr.server.ts` يرسل صورة/بايتات base64 إلى بوابة AI خارجية و`ai/bayan-*.server.ts` يرسل نصاً مستخرجاً؛ التفصيل الدقيق لكل حلقة (job→extraction→OCR→document_pages→search→Bayan) NOT_PROVEN. بلد المعالجة NOT_PROVEN (لا استنتاج).
- BUCKET_POLICY_EVIDENCE = **BLOCKED_BY_ACCESS**: قراءة `storage.buckets` / `storage.objects` وسياساتها لم تُنفَّذ؛ الدور المتاح للقراءة المباشرة مقيّد ولا يُنفّذ دوال، والفحص خارج نطاق هذه البوابة القرائية ⇒ لا تخمين لأي من documents / email-attachments / office-media-draft / office-public-media.
- DELIVERY & RAW PROCESSOR INVENTORIES: القوائم موجودة من S0/S0.5 (6 مسارات تسليم، 10 معالجات) لكنها على اللقطة السابقة ولم تُعَد التحقق على `fae672ba2439` ⇒ NOT_PROVEN في هذه اللقطة.
- ENTRYPOINT_ID_RECONCILIATION: تسمية EP-01..EP-11 مستقرة في ACR-01 R2/R3/R4 (EP-01 رفع داخلي · EP-02 بوابة العميل · EP-03 عقود · EP-04 مرفقات بريد صادر · EP-05 secure-view/طباعة · EP-06 وسائط عامة · EP-07 repair · EP-08 HR · EP-09 email-inbound · EP-10 background worker · EP-11 cron cleanup) ⇒ COMPLETE، بلا تعارض مرصود.

NEW_CRITICAL_ARCHITECTURE_FINDINGS = **CF-20**: حذف آثار التخزين في `cleanup.server.ts` يعمل على مستوى المستودع بلا مرشّح مستأجر، فأي خطأ في منطق "الكائن اليتيم" يحذف كائنات مكاتب أخرى (OBSERVED_IN_CODE). لم يُصلَح، للمراجعة المنفصلة.

## الناتج
SNAPSHOT_SHA = fae672ba2439 (SNAPSHOT_CHANGED_DURING_REVIEW = YES)
ENTRYPOINT_ID_RECONCILIATION = COMPLETE
CALL_GRAPH_COVERAGE = 2/11
UNKNOWN_CALL_GRAPH_EDGES = 9 نقاط دخول كاملة
FILE_OPERATION_COVERAGE = NOT_PROVEN
UNKNOWN_FILE_OPERATIONS = NOT_PROVEN
PUBLIC_MEDIA_COVERAGE = NOT_PROVEN
UNKNOWN_PUBLIC_MEDIA_WRITE_PATHS = NOT_PROVEN
BACKGROUND_WORKER_EVIDENCE = NOT_PROVEN
CURRENT_BACKGROUND_PROCESSOR_SECURITY_GATE = ABSENT (بدلالة المخطط) · تفاصيل المسار NOT_PROVEN
CRON_CLEANUP_EVIDENCE = OBSERVED_IN_CODE (جزئي: الجداول والعمليات والأهلية مثبتة · دقة منطق اليتيم NOT_PROVEN)
CURRENT_CLEANUP_BLAST_RADIUS = رموز وصول منتهية + آثار/كائنات يتيمة على مستوى المستودع بلا مرشّح مستأجر
BUCKET_POLICY_EVIDENCE = BLOCKED_BY_ACCESS
TOTAL_SERVICE_ROLE_IMPORTS = 62
FILE_RELATED_SERVICE_ROLE_IMPORTS = NOT_PROVEN
INSECURE_SECRET_FALLBACK_COUNT = 3 (المواقع الثلاثة المعروفة فقط؛ لا مواقع إضافية مرصودة)
CURRENT_DELIVERY_PATH_COVERAGE = NOT_PROVEN على هذه اللقطة
UNKNOWN_CURRENT_DELIVERY_PATHS = NOT_PROVEN
RAW_PROCESSOR_COVERAGE = NOT_PROVEN على هذه اللقطة
UNKNOWN_RAW_PROCESSORS = NOT_PROVEN
NEW_CRITICAL_ARCHITECTURE_FINDINGS = CF-20
BLOCKED_BY_ACCESS = سياسات Buckets وبيانات التخزين الوصفية
S0_EVIDENCE_FINAL_STATUS = NOT_PROVEN
DESIGN_STATUS = CLOSED
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR GO NO-GO IMPLEMENTATION DECISION

---

# MEHLA FINAL EVIDENCE CLOSURE — E1 (EP-03 / EP-04 / EP-05)

SNAPSHOT_SHA_START = fd3da4b20947 · SNAPSHOT_SHA_END = fd3da4b20947 · SNAPSHOT_STABLE = YES.

## EP-03 — CONTRACTS (OBSERVED_IN_CODE، جزئي)
- ENTRYPOINT: `contracts.functions.ts` (دوال خادمية) + مسار عام `routes/sign.$token.tsx`.
- AUTH/AUTHZ/TENANT: المسارات الداخلية `.middleware([requireSupabaseAuth])` ثم `resolveContractOrg(context.supabase, ...)` (RLS بهوية المستخدم) + `assertEntitlement` لبوابة التوقيع. المسار العام بلا جلسة: `getPublicContractForSigningFn` / `signPublicContractFn` / `downloadSignedContractByTicketFn`.
- TOKEN/CAPABILITY: رمز توقيع + **تذكرة تنزيل HMAC** (`issueContractDownloadTicket` / `resolveContractDownloadTicket`)، سرها من `contracts.server.ts:74` بنمط fallback غير آمن.
- DATABASE: `contracts`, `contract_events`, `contract_versions`, `contract_signers`, `case_updates`, RPC `next_contract_number` — كلها عبر `supabaseAdmin` (استيراد على مستوى الوحدة، `contracts.server.ts:6`) ⇒ RLS متجاوز في هذا المسار.
- STORAGE: لا عملية Storage مرصودة في `contracts.server.ts` ⇒ NOT_APPLICABLE.
- RAW BYTES / PDF: توليد PDF في الذاكرة داخل التطبيق ثم Base64 في الرد (`downloadSignedContractByTicketFn`, `downloadContractPdfFn`) + QR متجهي. لا تحليل ملف مستخدم.
- OUTPUT/DELIVERY: JSON يحمل base64 للمتصفح؛ التدقيق عبر `recordContractDownload` (`contract_events.event_type='exported_pdf'`).
- CLEANUP: NOT_PROVEN. CURRENT SECURITY GATE: **ABSENT** (لا حالة أمنية للملف).
- الحلقات غير المثبتة: انتهاء/إبطال تذكرة التنزيل وقت التشغيل، سلسلة `contract-lifecycle.server` كاملة ⇒ EP03_UNKNOWN_EDGES = 2.

## EP-04 — EMAIL ATTACHMENTS (OBSERVED_IN_CODE، جزئي)
- BUCKET: `ATTACHMENT_BUCKET` (خاص) في `email/attachments.server.ts`.
- العمليات المرصودة: `storage.from(ATTACHMENT_BUCKET).remove([path])` (سطر 219 و337) · `createSignedUrl(row.storage_path, ATTACHMENT_LINK_TTL_SECONDS, {...})` (285–287) · `createSignedUrl(..., ttlSeconds, { download: row.file_name })` (359–361).
- CREDENTIAL: عميل `db` خادمي (service role في هذه السلسلة) ⇒ RLS متجاوز.
- RAW BYTES: المرفقات الصادرة تُبنى عبر `email/transport/mime.server.ts` (multipart) ⇒ قراءة بايتات داخل التطبيق مرجّحة لكن **غير مثبتة سطرياً** في هذه الجولة ⇒ NOT_PROVEN.
- SECURITY GATE: لا فحص/إفراج أمني في السلسلة ⇒ ABSENT بدلالة غياب أي حالة أمنية في المخطط؛ سؤال "هل يمكن إرسال مستند AVAILABLE بلا Release؟" = **نعم بحكم غياب البوابة** (INFERRED من الغياب، لا من سطر يمنع/يسمح) ⇒ يُسجَّل NOT_PROVEN حتى قراءة مسار الإرسال كاملاً.
- الوارد (inbound) عبر `routes/api/public/hooks/email-inbound.ts` = EP-09، خارج نطاق E1.
- EP04_UNKNOWN_EDGES = 3 (قراءة البايتات، مسار الإرسال إلى المزود، تفويض/مستأجر عند التنزيل).

## EP-05 — SECURE VIEW / PRINT (OBSERVED_IN_CODE، شبه مكتمل)
- ENTRYPOINT: `routes/api/public/doc.$token.ts` — الطريق الوحيد الذي يلمس مستنداً مخزّناً.
- CAPABILITY: رمز غير شفاف يُستهلك بـ`consumeAccessToken` (محدود المدة والاستخدامات)؛ تطابق المكتب يُفرض صراحةً (`doc.organization_id !== resolved.organizationId` ⇒ 403).
- CREDENTIAL: `supabaseAdmin` عبر استيراد داخل الدالة (`secure-view.server.ts:84-85`) ⇒ RLS متجاوز.
- STORAGE READ: `db.storage.from(trace.bucket).createSignedUrl(filePath, 60, ...)` (سطر 297) ثم `new Uint8Array(await response.arrayBuffer())` (354) ⇒ **قراءة بايتات خام داخل التطبيق مؤكدة**، Bucket = `documents` (خاص)، TTL الرابط الموقّع = 60 ثانية وخادمي بالكامل.
- TRANSFORM: `stamp.buildWatermarkedPdf` (ختم مائي خادمي) + نص بديل من `loadExtractedText`؛ تذكرة `kind === "process"` تُعيد **البايتات الأصلية** لمحرك الاستخراج.
- DELIVERY: PDF مباشر بترويسات `no-store`/`nosniff`/`accept-ranges: none`؛ تدقيق `logDocumentAccess` لمسار المشاركة.
- CLEANUP: عبر EP-11 (`cleanup.server.ts`).
- SECURITY GATE: **ABSENT** (لا شرط حالة أمنية قبل القراءة). إعادة استخدام الرمز/التزامن = NOT_PROVEN (يتطلب اختبار وقت تشغيل في P0).
- EP05_UNKNOWN_EDGES = 1 (دلالات إعادة استخدام الرمز وقت التشغيل).

## جدول العمليات المكتشفة في E1
| OP_ID | EP | CALLER | WRAPPER_CHAIN | FINAL_OP | BUCKET | CREDENTIAL | TENANT_CHECK | RAW_BYTES | DELIVERY_IMPACT |
|---|---|---|---|---|---|---|---|---|---|
| OP-E1-01 | 05 | `doc.$token.ts` | `secure.readOriginal` → `db()` | `createSignedUrl(60s)` + fetch | documents | service role | نعم (org match) | نعم | PDF مائي للجمهور بالرمز |
| OP-E1-02 | 05 | `doc.$token.ts` (kind=process) | نفس السلسلة | إعادة البايتات الأصلية | documents | service role | نعم | نعم | بايتات خام لمحرك الاستخراج |
| OP-E1-03 | 04 | `attachments.server.ts:285` | `db.storage` | `createSignedUrl(TTL)` | email-attachments | service role | NOT_PROVEN | لا | رابط تنزيل مرفق |
| OP-E1-04 | 04 | `attachments.server.ts:359` | `db.storage` | `createSignedUrl(ttl,{download})` | email-attachments | service role | NOT_PROVEN | لا | تنزيل مباشر |
| OP-E1-05 | 04 | `attachments.server.ts:219,337` | `db.storage` | `remove([path])` | email-attachments | service role | NOT_PROVEN | لا | حذف |
| OP-E1-06 | 03 | `contracts.functions.ts` | `generateContractPdf` | توليد PDF بالذاكرة | — | service role (DB) | نعم داخلياً / تذكرة عامة | نعم (مولّدة) | base64 للمتصفح |

## الناتج
SNAPSHOT_SHA_START = fd3da4b20947
SNAPSHOT_SHA_END = fd3da4b20947
SNAPSHOT_STABLE = YES
EP03_CALL_GRAPH = NOT_PROVEN (جزئي — حلقتان ناقصتان)
EP04_CALL_GRAPH = NOT_PROVEN (جزئي — ثلاث حلقات ناقصة)
EP05_CALL_GRAPH = NOT_PROVEN (شبه مكتمل — حلقة واحدة ناقصة تعتمد على وقت التشغيل)
EP03_UNKNOWN_EDGES = 2 · EP04_UNKNOWN_EDGES = 3 · EP05_UNKNOWN_EDGES = 1
NEW_FILE_OPERATIONS_FOUND = 6 (OP-E1-01..06)
NEW_DELIVERY_PATHS_FOUND = 3 (تذكرة تنزيل عقد HMAC · روابط مرفقات موقّعة · بايتات خام لتذكرة `process`)
NEW_RAW_PROCESSORS_FOUND = 1 (مسار `kind=process` يعيد البايتات الأصلية بلا ختم)
NEW_SERVICE_ROLE_USAGE_FOUND = 3 وحدات مؤكدة (contracts, secure-view, email/attachments)
NEW_CRITICAL_FINDINGS = CF-21: تذكرة `kind="process"` تُخرج البايتات الأصلية غير المفحوصة عبر مسار عام (`/api/public/doc/$token`) بلا أي بوابة أمنية (OBSERVED_IN_CODE، `doc.$token.ts:178-186`) — لم يُصلَح
CF20_STATUS = GLOBAL_CLEANUP_BLAST_RADIUS OBSERVED_IN_CODE
CROSS_TENANT_DELETION_EXPLOITABILITY = NOT_PROVEN (يُغلق في E3)
TOTAL_CALL_GRAPH_COVERAGE = 2/11 مكتمل + 3 جزئية (لا يُرقّى إلى 5/11)
DESIGN_STATUS = CLOSED
IMPLEMENTATION_APPROVAL = NOT_GRANTED

WAITING FOR E1 SECURITY REVIEW
