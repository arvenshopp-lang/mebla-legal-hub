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
