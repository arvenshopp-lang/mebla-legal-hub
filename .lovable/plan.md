# MEHLA MAXIMUM FILE SECURITY ARCHITECTURE — REVISION V2

تصميم ومراجعة معمارية فقط. لا Migration ولا Schema ولا Storage ولا RLS ولا Deploy ولا Backfill ولا Rescan.

## 1. EXECUTIVE SECURITY ASSESSMENT
مِهلة اليوم تملك **تحقق بنيوي جيد وعزل تخزين ممتاز، وصفر فحص محتوى خبيث**. المخازن الأربعة خاصة، وسياسات `storage.objects` تمنع أدوار المتصفح من مخزن المستندات كلياً، والتحقق من Magic Bytes خادمي وحقيقي. لكن الملف يُرفع إلى **نفس المخزن النهائي**، ويُعتبر صالحاً بمجرد اجتياز فحص التوقيع، ثم يدخل مباشرة إلى العرض والتنزيل والـOCR والذكاء الاصطناعي. لا يوجد Quarantine ولا Decision Engine ولا Release Gate ولا SHA-256 لمستندات القضايا ولا تاريخ فحص.

الفجوة الجوهرية ليست «نقص Antivirus» بل **غياب بوابة تسليم مستقلة**: لا توجد نقطة واحدة في الكود يجب أن يمر عبرها كل تسليم للملف.

## 2. FILE SECURITY THREAT MODEL
| # | التهديد | مسار الهجوم | المكوّن المتأثر | الضابط الحالي | الضابط المقترح | الخطورة | المخاطر المتبقية |
|---|---|---|---|---|---|---|---|
| T1 | برمجية خبيثة في PDF/DOCX | عميل يرفع عبر رابط طلب المستندات | Storage + جهاز المحامي | لا شيء | AV + YARA + تحليل بنيوي + Release Gate | حرجة | ثغرات Zero-day |
| T2 | فدية موجّهة | مرفق بريد وارد ثم تنزيل | email-attachments | حجر جزئي بلا فحص | نفس الخط الموحد | حرجة | منخفضة بعد التنفيذ |
| T3 | مستند تصيّد | رابط أو إجراء داخل PDF | المستخدم | لا شيء | كشف URI/OpenAction وتحذير | عالية | هندسة اجتماعية |
| T4 | استغلال محلل المستندات | PDF مشوّه ضد العارض | متصفح المستخدم | ختم PDF خادمي | تحليل بنيوي + CDR | عالية | ثغرات العارض |
| T5 | ماكرو VBA | docm أو OLE متنكر | المستخدم | رفض الامتداد فقط | كشف vbaProject و OLE داخل ZIP | عالية | منخفضة |
| T6 | Polyglot (PDF+ZIP+HTML) | ملف يجتاز فحصاً واحداً | خط الإدخال | فحص بصمة واحدة | تعدد كاشفات ومنع تعدد التواقيع | عالية | متوسطة |
| T7 | TOCTOU واستبدال الكائن | إعادة استخدام رابط رفع بعد الفحص | Storage | فهرس فريد على المسار | حجر غير قابل للتغيير + ثلاث بصمات | عالية | منخفضة |
| T8 | تزوير نتيجة الماسح | استدعاء Callback مزيّف | Decision Engine | لا يوجد ماسح | ربط النتيجة بـ scan_id و sha256 و object_key مع توقيع | عالية | منخفضة |
| T9 | تسريب Signed URL | مشاركة الرابط | Storage | 60 ثانية فقط | نفسه + إبطال فوري عند التصنيف الخبيث | متوسطة | نافذة 60 ثانية |
| T10 | وصول عبر المكاتب | تخمين معرّف أو مسار | DB + Storage | RLS وبادئة مسار المكتب | نفسه + عزل الحجر والنتائج | حرجة | منخفضة |
| T11 | برمجية قديمة (Legacy) | 40 ملف AVAILABLE و2 UNCHECKED ومرفقات not_scanned | كل النظام | لا شيء | LEGACY MIGRATION | عالية | قائمة حتى اكتمال الترحيل |
| T12 | ملفات حرمان الخدمة | Zip/XML bomb، PDF بآلاف الصفحات | Worker والماسح | حد 20MB فقط | حدود موارد لكل محلل | متوسطة | منخفضة |
| T13 | إساءة داخلية | موظف مكتب يرفع أو ينزّل | التدقيق | تدقيق جزئي | تدقيق كامل + Override بصلاحية منفصلة | متوسطة | متأصلة |
| T14 | سلسلة توريد الماسح | تواقيع أو قواعد ملوّثة | الماسح | لا شيء | تثبيت الإصدارات وتحقق التوقيع ورصد | متوسطة | متوسطة |
| T15 | معالجة ملف غير مفحوص | OCR وبيان والفهرسة تقرأ الملف | AI + OCR | لا بوابة | Release Gate إلزامي قبل أي معالج | عالية | منخفضة |

## 3. CURRENT ARCHITECTURE (مثبت من الكود وقاعدة البيانات)
```text
المتصفح → دالة خادمية → Signed Upload URL → bucket "documents" (نهائي)
        → الخادم ينزّل ويتحقق (حجم/امتداد/MIME معياري/Magic Bytes)
        → صف documents (file_status = AVAILABLE) → متاح فوراً للعرض والتنزيل والـOCR
```
- المخازن: `documents` (خاص، 20MB، قائمة MIME على مستوى المخزن أوسع من التطبيق)، `email-attachments`، `office-media-draft`، `office-public-media` — كلها Private.
- `storage.objects`: سياسة «documents bucket is server only» تمنع anon و authenticated.
- `documents`: لا `sha256` ولا `scan_status`؛ فقط `file_status` بقيم AVAILABLE / UNCHECKED / FILE_MISSING / INVALID_FILE.
- `email_attachments`: فيه `sha256` و`scan_status` و`is_quarantined`، والقيمة الفعلية المكتوبة `not_scanned`.

### FILE INGESTION ENTRY POINTS (حصر فعلي من الكود)
| # | نقطة الدخول | المسار | الحماية الحالية |
|---|---|---|---|
| E1 | رفع المستندات من مساحة العمل | `documents/intake.functions.ts` + `intake.server.ts` | دور + بادئة مسار + بصمة بايتات |
| E2 | رفع العميل عبر رابط الطلب | `client-portal.functions.ts` | توكن + حد محاولات + نفس الفحص |
| E3 | مرفقات البريد الصادر | `email/attachments.server.ts` | قائمة سماح + SHA-256 بلا فحص خبيث |
| E4 | مرفقات البريد الوارد | `quarantineInboundAttachment` | حجر عند الرفض البنيوي فقط |
| E5 | وسائط صفحة المكتب | `office-page.server.ts` (draft ← public) | خادمي، لكن الوجهة **عامة** |
| E6 | مسار الإصلاح | `documents/repair.server.ts` | يثبّت الحالة بلا فحص محتوى كامل |

لا توجد نقطة رفع تتخطى الخادم، لكن **كل النقاط تخلو من فحص محتوى خبيث** ⇒ بالمعيار الجديد `UNPROTECTED_UPLOAD_PATHS > 0` اليوم.

## 4. WEAKNESSES IN REVISION V1
1. «نفس البصمة = نفس القرار» بشكل مطلق — خطأ: القرار يجب أن يرتبط بإصدارات المحرك والتواقيع والسياسة.
2. الماسح كان يقرر التحرير ضمناً؛ بلا فصل بين النتيجة والقرار والتحرير.
3. غياب نموذج نزاهة (ثلاث بصمات) وحماية TOCTOU.
4. جدول فحص واحد يُكتب فوقه — بلا تاريخ ولا فحوص متعددة.
5. وصفت `scanner.internal` بلا شرح اتصال حقيقي من بيئة Worker.
6. لم تعالج البريد ووسائط المكتب ومسار الإصلاح كخط واحد.
7. لا Override Workflow ولا استجابة رجعية ولا إعادة فحص مستمرة.
8. Rollback كان قد يعيد النظام إلى Fail Open.

## 5. REVISED SECURITY ARCHITECTURE
```text
[Authorization Gate] → [Tenant Validation] → [Upload Slot أحادي الاستخدام]
        ↓
[IMMUTABLE QUARANTINE BUCKET]  خاص، خادمي فقط، لا Signed URL للقراءة أبداً
        ↓  HASH_AT_UPLOAD
[Type Validation]  extension + declared MIME + detected MIME + magic bytes + polyglot
[Integrity]        HASH_AT_SCAN == HASH_AT_UPLOAD
[Structural]       محللات PDF / OOXML / Archive بحدود موارد صارمة
[Malware]          ClamAV عبر بوابة سعودية خاصة
[YARA]             قواعد موقّعة بإصدار مثبت
[CDR]              مرحلة لاحقة → مشتق مطهّر
        ↓
[SECURITY DECISION ENGINE]  يجمع كل النتائج مع إصدار السياسة → قرار واحد مُخزَّن
        ↓
[RELEASE GATE]  HASH_BEFORE_RELEASE == HASH_AT_UPLOAD ⇒ نسخ إلى المخزن النهائي ⇒ released
        ↓
[Delivery]  عرض / تنزيل / بحث / ذكاء اصطناعي / مشاركة — ولا مسار آخر
```

### Immutable Quarantine Design
- مخزن `documents-quarantine` منفصل، `public=false`، وسياسة تمنع anon و authenticated كلياً على نمط سياسة «server only» القائمة.
- مفتاح الكائن: `<org_id>/<scan_id>/<uuid>.<ext>` — غير قابل للتخمين ومرتبط بعملية فحص واحدة.
- رابط الرفع الموقّع **أحادي الاستخدام**: بعد أول رفع ناجح يُسجَّل `uploaded_at`، وأي رفع لاحق على نفس المفتاح يُرفض (`upsert:false` + اشتراط الحالة `upload_slot_created`) ويُسجَّل كـ `object_replacement_attempt`.
- بعد الحالة `uploaded` لا يكتب النظام إطلاقاً على مفتاح الحجر؛ التحرير **نسخ إلى مفتاح جديد** في المخزن النهائي ثم حذف الأصل وفق سياسة الاحتفاظ.
- قفل استشاري على `scan_id` يمنع الفحص والتحرير المتزامنين.

### Integrity Model
`HASH_AT_UPLOAD` (أول قراءة كاملة) = `HASH_AT_SCAN` (قبل كل محلل) = `HASH_BEFORE_RELEASE` (قبل النسخ)، مع `HASH_AFTER_RELEASE` للتحقق من سلامة النسخ. أي اختلاف ⇒ `integrity_mismatch` ⇒ `blocked` وحدث أمني. تُخزَّن `size` و`etag` و`last_modified` كمؤشرات مساعدة، والبصمة وحدها هي الحَكَم.

### Decision Reuse (بديل قاعدة «نفس البصمة = نفس القرار»)
إعادة استخدام قرار سابق مسموحة فقط عند تطابق: `sha256` + `scanner_engine` + `scanner_engine_version` + `av_signatures_version` + `yara_rules_version` + `structural_analyzer_version` + `security_policy_version`، وأن يكون `last_scanned_at` أحدث من `MAX_DECISION_AGE` (مقترح 30 يوماً)، وأن يكون القرار السابق `clean`. غير ذلك ⇒ **MANDATORY_RESCAN**. قرارات `suspicious` و`malicious` لا تُعاد استخداماً للسماح إطلاقاً، بل للحظر الفوري. إعادة الاستخدام تتم **داخل نطاق المكتب فقط**.

### Structural Analysis Architecture
- **PDF**: JavaScript / JS / OpenAction / AA / Launch / EmbeddedFile / RichMedia / XFA / URI / GoToR / SubmitForm / ObjStm غير طبيعية / كائنات مشوّهة / تشفير / كلمة مرور / تنفيذيات مضمّنة / عمق تداخل. التصنيف: SAFE / SUSPICIOUS / BLOCK / UNSCANNABLE. **PDF مشفّر أو محمي بكلمة مرور = UNSCANNABLE وليس clean.**
- **OOXML**: vbaProject.bin، ماكرو، oleObject، ActiveX، تنفيذيات مضمّنة، externalLink، attachedTemplate عن بُعد، DDE و DDEAUTO، روابط مشبوهة، OOXML مشوّه، تمدد XML مفرط (Billion Laughs)، حزم مضمّنة. ZIP صالح لا يعني Office نظيف.
- **DOC/XLS/PPT الثنائية**: غير مدعومة اليوم؛ إن دُعمت لاحقاً تُعامل كـ OLE عالي الخطورة مع تحليل إلزامي لتيارات الدليل.
- **الأرشيفات**: تبقى مرفوضة حتى S6. عند السماح: MAX_ARCHIVE_DEPTH=2، MAX_FILE_COUNT=200، MAX_EXTRACTED_SIZE=200MB، نسبة ضغط ≤ 100:1، ورفض Zip Slip والمسارات المطلقة والتنفيذيات.
- حدود الموارد لكل محلل: `PARSE_TIMEOUT=8s`، `MAX_PDF_OBJECTS=50k`، `MAX_PDF_PAGES=2000`، `MAX_XML_ENTITIES=0` (منع الكيانات كلياً)، `MAX_MEMORY_PER_PARSE ≈ 64MB`. تجاوز أي حد ⇒ `unscannable` وليس نجاحاً.

### YARA Architecture
قواعد بإصدار موقّع تُحدَّث عبر عملية مُدارة، ومجموعات منفصلة (Web shells، تعمية، أنماط ماكرو، استغلال مستندات، IOC خاصة بمِهلة). النتيجة **مؤشر خطورة** يدخل محرك القرار ولا تحرّر ولا تحظر وحدها إلا للقواعد المصنّفة `blocking`.

### CDR Architecture (تصميم فقط)
الأصل **يبقى كما هو دائماً** حفاظاً على القيمة الإثباتية والبصمة. يُنتج **مشتق مطهّر** بمفتاح مستقل مع: `original_sha256`, `sanitized_sha256`, `cdr_engine`, `cdr_version`, `removed_elements[]`, `transformed_at`. سياسة الاستخدام: العرض داخل المنصة يستخدم المشتق المطهّر افتراضياً، والتنزيل الأصلي متاح لأصحاب الصلاحية مع إفصاح صريح، وأي إرفاق بعقد أو دليل يستخدم الأصل مع بصمته.

### Scanner Architecture (الاتصال الحقيقي)
بيئة التشغيل Cloudflare Worker: **لا يمكن تشغيل ClamAV أو YARA داخلها** (لا عمليات فرعية ولا ملفات تنفيذية). ولا توجد شبكة خاصة بين Lovable Cloud والبنية السعودية، لذلك الوصف الصحيح ليس `scanner.internal` بل:
```text
Worker → HTTPS عام إلى scan.mehlalex.com (بوابة الماسح السعودية)
```
الضوابط: mTLS بشهادة عميل مخصصة، توقيع HMAC-SHA256 على (method + path + sha256(body) + timestamp + nonce)، نافذة زمنية ±120 ثانية، مخزن nonce لمنع إعادة الإرسال، حد لحجم الطلب، قائمة IP مسموحة إن أمكن، هوية خدمة مستقلة لكل بيئة، ودوران مفاتيح كل 90 يوماً.
**النموذج المفضل — Pull:** الماسح يسحب الملف بنفسه عبر رابط موقّع قصير جداً مخصص لهوية الخدمة، بدل تمرير البايتات عبر Worker مرتين (أفضل أداءً وأقل كشفاً).

### Callback Trust Model
لا يُقبل رد يحمل `clean` فقط. يجب أن يحمل الرد موقّعاً: `scan_id`, `organization_id`, `object_key`, `sha256`, `scanner`, `scanner_version`, `signature_version`, `yara_version`, `result`, `timestamp`, `nonce`. ويتحقق الخادم من: صحة التوقيع، أن `scan_id` بحالة `malware_scanning`، أن `sha256` يطابق `HASH_AT_UPLOAD` المخزّن، أن `object_key` و`organization_id` يخصان نفس السجل، وأن `nonce` لم يُستخدم. هذا يمنع الانتحال وإعادة الإرسال واستبدال النتيجة وإعادة استخدام نتيجة ملف آخر.

## 6. STATE MACHINE
`upload_slot_created → uploading → uploaded → quarantined → hashing → type_validation → structural_scanning → malware_scanning → yara_scanning → (cdr_processing) → decision_pending → {clean | suspicious | malicious | unscannable | scan_timeout | scan_failed | integrity_mismatch} → (clean) release_pending → releasing → released | release_failed → blocked → deleted`

**ALLOWED_TRANSITIONS:** التقدّم خطوة بخطوة فقط؛ `decision_pending → clean` عند اجتياز كل الطبقات؛ `clean → release_pending → releasing → released`؛ `scan_failed` و`scan_timeout → malware_scanning` عبر Retry محدود؛ أي حالة → `blocked` مسموحة دائماً؛ `released → suspicious/malicious` مسموحة عند إعادة الفحص وتستتبع إبطالاً فورياً؛ `suspicious → release_pending` عبر Override معتمد فقط.

**FORBIDDEN_TRANSITIONS:** `uploaded → released` · `uploading → clean` · أي حالة → `released` بلا `release_pending` · `malicious → clean` بلا فحص جديد كامل · `integrity_mismatch → أي حالة سماح` · `unscannable / scan_failed / scan_timeout → released` · `blocked → released` بلا Override موثّق · أي انتقال يقفز فوق `decision_pending`.

## 7. FAIL CLOSED — إثبات FAIL_OPEN_PATHS = 0
كل حالة غير حاسمة تُصنَّف صراحةً: الماسح غير متاح ⇒ `scan_failed` · Timeout ⇒ `scan_timeout` · فشل محلل بنيوي ⇒ `unscannable` · فشل YARA ⇒ `scan_failed` · تعذّر الشبكة ⇒ `scan_failed` · اختلاف البصمة ⇒ `integrity_mismatch` · نوع مجهول ⇒ `blocked` · رد ماسح غير متوقع ⇒ `suspicious` · استثناء داخلي ⇒ `scan_failed`.
**الافتراضي في الكود هو الرفض**: بوابة التسليم تشترط `state === 'released'` كشرط إيجابي وحيد، لا قائمة حالات ممنوعة — فأي حالة جديدة تُضاف مستقبلاً تكون محجوبة تلقائياً. Retry: ثلاث محاولات بتباعد أسّي (30 ثانية / دقيقتان / 8 دقائق) ثم `scan_failed` وحادث. المستخدم يرى «جارٍ التحقق من الملف» فقط.

## 8. RELEASE GATE
دالة وحيدة `assertFileDeliverable({ actor, tenantId, fileId, purpose })` تُرجع سياقاً موقّعاً داخلياً وتتحقق من: الجلسة والصلاحية، تطابق المكتب، `state === released`، القرار الأمني الحالي `clean`، تطابق إصدار السياسة، ونزاهة البصمة. تمر عبرها **كل** المسارات: العرض، التنزيل، إصدار الروابط الموقّعة، الختم بالعلامة المائية، الفهرسة، OCR، «بيان»، إعادة الإرسال بالبريد، مشاركة العميل، الربط بالعقود. حارس ثابت (guardrail script) يمنع أي استدعاء مباشر لـ `createSignedUrl` أو `download` على مخازن المستندات خارج البوابة ⇒ `DELIVERY_BYPASS_PATHS = 0` قابل للتحقق آلياً في CI.

## 9. SIGNED URL SECURITY
المواضع الحالية: `secure-view.server.ts` (60 ثانية)، `email/attachments.server.ts` (300 ثانية)، `office-page.server.ts` (300 ثانية)، `subscription.functions.ts` للفواتير (60 ثانية). القواعد الجديدة: لا إصدار إلا من بوابة التسليم؛ TTL ≤ 60 ثانية للمستندات و≤ 300 للمرفقات؛ اسم تنزيل منقّى مع `filename*=UTF-8''` لدعم العربية ومنع حقن Content-Disposition؛ `Cache-Control: private, no-store` ومنع تخزين CDN؛ تجنّب تسريب الرابط عبر Referer بفتحه من إجراء خادمي أو Blob بدل التنقل المباشر؛ وإبطال فوري عند تحوّل الملف إلى `malicious`.

## 10. DATABASE MODEL (تصميم فقط)
| الجدول | الغرض | ملاحظات |
|---|---|---|
| `secure_files` | السجل المرجعي: المكتب، مصدر الدخول، الاسم الأصلي، مفتاح الحجر، المفتاح النهائي، الحالة، البصمات، الحجم | مصدر الحقيقة للحالة |
| `file_scans` | كل تشغيل فحص (append-only): المحرك، الإصدارات، البداية والنهاية، المدة، رقم المحاولة | فحوص متعددة لنفس الملف |
| `file_scan_results` | نتيجة كل طبقة (structural / av / yara / cdr) بتفاصيل jsonb | لا يُكتب فوقها |
| `file_security_decisions` | قرار مؤرَّخ (append-only) + `is_current` + إصدار السياسة | SCAN_001 CLEAN و SCAN_002 MALICIOUS يبقيان معاً |
| `file_release_events` | محاولات ونجاح التحرير مع البصمة قبل وبعد | |
| `file_security_overrides` | طلب واعتماد الاستثناء، السبب، المراجع، قبل وبعد | |
| `file_security_audit_events` | Append-only لكل حدث | بلا UPDATE أو DELETE |
| `file_ioc` | بصمات ومؤشرات اختراق للاستجابة الرجعية | |

RLS: القراءة داخل المكتب فقط، الكتابة خادمية فقط، ومنع UPDATE و DELETE على الجداول التاريخية عبر سياسات ومحفّزات. GRANT صريح لكل جدول جديد. `documents` و`email_attachments` يرتبطان بـ `secure_files` بمفتاح واحد بلا تكرار حالة الأمان في مكانين.

## 11. TENANT ISOLATION
مفتاح الحجر يبدأ بـ `organization_id`، وكل جداول الأمان تحمل `organization_id` مع RLS، ولا تُعاد أي بصمة أو نتيجة فحص أو مفتاح كائن عبر أي واجهة بلا تطابق المكتب. إعادة استخدام القرار عبر البصمة **داخل المكتب فقط** (الإعادة العابرة تسرّب وجود ملف مطابق لدى مكتب آخر). لوحة مِهلة ترى إحصاءات وبيانات وصفية فقط، بلا محتوى ولا أسماء ملفات عملاء إلا بصلاحية صريحة وسبب مسجّل.

## 12. SERVICE-TO-SERVICE (ZERO TRUST)
هويات خدمة منفصلة لكل مكوّن (Backend / Scanner / Release Worker)، أقل امتياز (الماسح يقرأ من الحجر فقط ولا يكتب في المخزن النهائي إطلاقاً)، اعتمادات قصيرة العمر، توقيع كل طلب، nonce وطابع زمني، دوران مفاتيح كل 90 يوماً، وتدقيق كل مكالمة بين الخدمات. لا خدمة تثق برد خدمة أخرى بلا تحقق توقيع وربط بالبصمة.

## 13. CONTINUOUS FILE SECURITY
إعادة الفحص تُجدول عند: تحديث تواقيع مكافح الفيروسات (دفعات ليلية للملفات النشطة خلال 12 شهراً)، تحديث قواعد YARA، تغيّر إصدار السياسة الأمنية، ظهور IOC جديد (استهداف فوري بالبصمة)، حادث أمني، أو تجاوز آخر فحص 180 يوماً للملفات النشطة. وقبل التنزيل: إذا كان القرار أقدم من `MAX_DECISION_AGE` والملف عالي المخاطر ⇒ إعادة فحص متزامنة قبل إصدار الرابط. الميزانية: دفعات محدودة المعدل خارج ساعات الذروة بأولوية (ملفات نُزّلت مؤخراً ← ملفات مشتركة مع عملاء ← الباقي).

## 14. LEGACY FILE STRATEGY (الهدف LEGACY_UNSCANNED_FILES = 0)
1. **Inventory**: حصر كل كائن في `documents` و`email-attachments` ومطابقته بالسجلات (اليوم: 40 AVAILABLE و2 UNCHECKED ومرفقات `not_scanned`).
2. **Hashing**: حساب SHA-256 وإنشاء `secure_files` بحالة `legacy_unscanned` — **وليس clean**.
3. **Classification**: حسب المصدر والنوع والعمر ومشاركة العميل.
4. **Access during migration**: مرحلة انتقالية معلنة زمنياً — يبقى الوصول للملفات القديمة عاملاً مع شارة «قيد المراجعة الأمنية» حتى نهاية S6، ثم يصبح مشروطاً بالفحص. (الحجب الفوري يعطّل مكاتب عاملة، لذا يُدار بزمن محدود لا بثغرة دائمة.)
5. **Rescan** بالأولوية: المشترك مع عملاء ← مرفقات البريد الوارد ← مستندات القضايا ← الباقي.
6. **Failure handling**: الملف المفقود ⇒ `file_missing`؛ غير القابل للفحص ⇒ `unscannable` ومراجعة.
7. **Exit**: صفر سجل بحالة `legacy_unscanned`.

## 15. UNIFIED PIPELINE (بما فيه البريد)
واجهة `ingestFile()` واحدة لكل نقاط الدخول E1–E6. مرفقات البريد الصادر تُفحص قبل الإرسال؛ الوارد يدخل الحجر ولا يُعرض قبل التحرير؛ **وسائط صفحة المكتب تُفحص قبل النقل من المسودة إلى المخزن العام — وهي أعلى أولوية لأنها الوجهة العامة الوحيدة**؛ ومسار الإصلاح يعيد الفحص بدل تثبيت الحالة.

## 16. INCIDENT RESPONSE & RETROACTIVE MALWARE
```text
MALICIOUS → حظر فوري → حدث أمني → تحديد المكتب والمستخدم → تسجيل البصمة كـ IOC
 → البحث عن نفس البصمة في كل المكاتب → هل سبق تحريره؟
 → نعم: SECURITY INCIDENT → إبطال الروابط → تعطيل العرض والتنزيل
 → إشعار المكتب المتأثر برسالة عربية واضحة بلا تفاصيل داخلية
 → سجل تحقيق: من نزّل ومتى ومن أي IP
```
يُحتفظ بالملف الخبيث في الحجر لمدة التحقيق وفق السياسة ثم يُحذف بشكل موثّق. رسالة المستخدم: «تم رفض الملف لعدم اجتيازه فحص الأمان.»

## 17. SECURITY OVERRIDE WORKFLOW
صلاحية مستقلة `file_security.override` غير ممنوحة لأي دور افتراضياً ولا لمدير المكتب.
- `suspicious`: طلب + سبب إلزامي + هوية المراجع + مصادقة تصعيدية MFA + حدث تدقيق + قرار جديد يُسجَّل بلا حذف السابق.
- `malicious`: **لا Override عادي** — موافقة مزدوجة من مِهلة (super_admin + مسؤول أمن) وسبب موثّق وقيد زمني.
- `integrity_mismatch` والحظر بسبب النزاهة: **لا Override إطلاقاً**، الحل إعادة الرفع.

## 18. AUDIT EVENTS
حقول كل حدث: `event`, `occurred_at`, `organization_id`, `actor_type` (user/service/system), `actor_id`, `file_id`, `scan_id`, `sha256`, `state_from`, `state_to`, `result`, `engine + versions`, `policy_version`, `ip`, `user_agent`, `reason`, `correlation_id`.
الأحداث: FILE_UPLOAD_STARTED · FILE_QUARANTINED · HASH_CALCULATED · TYPE_VALIDATION_COMPLETED · STRUCTURAL_SCAN_STARTED/COMPLETED · AV_SCAN_STARTED/COMPLETED · YARA_SCAN_COMPLETED · CDR_STARTED/COMPLETED · SECURITY_DECISION_CREATED · FILE_RELEASE_STARTED · FILE_RELEASED · FILE_BLOCKED · FILE_DELIVERED · FILE_RESCAN_STARTED · FILE_RESCAN_RESULT_CHANGED · SECURITY_OVERRIDE_REQUESTED/APPROVED/REJECTED · INTEGRITY_MISMATCH_DETECTED · SCANNER_CALLBACK_REJECTED.

## 19. SECURITY TELEMETRY (قسم «أمن الملفات» في لوحة مِهلة)
إجمالي المرفوع · قيد الفحص · متوسط ومئين 95 لمدة الفحص · كشوف AV · كشوف YARA · مشبوه بنيوياً · غير قابل للفحص · فشل · Timeout · اختلاف بصمة · Overrides · بانتظار المراجعة · ملفات قديمة متبقية · صحة الماسح · عمر التواقيع وآخر تحديث · إصدار قواعد YARA · إصدار السياسة الأمنية. بلا عرض محتوى العملاء.

## 20. FILE BOMB & RESOURCE PROTECTION
حدود خادمية لكل نوع: PDF ≤ 20MB و2000 صفحة · صور ≤ 10MB · نصوص ≤ 2MB · OOXML ≤ 20MB مع تمدد ≤ 10× · مهلة تحليل 8 ثوانٍ · ذاكرة ≤ 64MB لكل تحليل · منع كيانات XML كلياً · حد عمق التداخل 2 · حد عدد الملفات المستخرجة 200 · نسبة ضغط ≤ 100:1. تجاوز أي حد ⇒ `unscannable` أو `blocked`، ولا يُعتبر نجاحاً أبداً. طابور فحص بحد تزامن لكل مكتب لمنع إغراق الماسح.

## 21. FILENAME & METADATA SECURITY
تطبيع Unicode (NFC)، إزالة محارف التحكم والبايت الصفري ومحارف اتجاه النص المخادعة (RLO/LRO) مع **الإبقاء على الحروف العربية سليمة**، رفض الامتدادات المزدوجة والمخفية، منع Path Traversal، حد طول 180 محرفاً، رفض أسماء ويندوز المحجوزة، والاسم الأصلي يُحفظ كبيانات وصفية فقط بينما مفتاح التخزين UUID. اسم التنزيل يُرمَّز بـ `filename*=UTF-8''` لمنع حقن الترويسات.

## 22. PRIVACY / DATA RESIDENCY
منع افتراضي في الكود (لا في السياسة فقط) لإرسال أي محتوى إلى VirusTotal أو أي Sandbox أو ماسح عام. الماسح داخل بنية نتحكم بها: معالجة داخل السعودية، احتفاظ صفر بالمحتوى بعد إصدار النتيجة (باستثناء الخبيث لمدة تحقيق محدودة)، تسجيل بيانات وصفية فقط، بلا معالجات فرعية، تشفير أثناء النقل والسكون، وحذف موثّق. أي بحث سمعة مستقبلي: **Hash Lookup Only** وبموافقة صريحة.

## 23. PERFORMANCE
تحقق النوع والبصمة < 100ms · SHA-256 لملف 20MB ≈ 150–400ms · التحليل البنيوي 0.3–1.5s · AV و YARA خارجياً 1–4s (حتى 8s للملفات الكبيرة). الأثر: الرفع يصبح **غير متزامن** مع Polling وشارة «قيد التحقق»؛ العرض والتنزيل بعد التحرير بلا تغيير؛ إعادة الفحص الدورية خارج ساعات الذروة.

## 24. FAILURE SCENARIOS
| السيناريو | السلوك |
|---|---|
| الماسح متوقف | ملفات جديدة تبقى محجورة، المحرَّرة سابقاً تعمل، تنبيه تشغيلي |
| Timeout | `scan_timeout` ثم Retry محدود ثم حادث |
| رد ماسح مزوّر أو مُعاد | رفض الرد + `SCANNER_CALLBACK_REJECTED` + تنبيه أمني |
| اختلاف بصمة | `integrity_mismatch` + حظر + تحقيق |
| فشل النسخ عند التحرير | `release_failed`، الملف يبقى غير متاح، إعادة محاولة آمنة |
| تعطل قاعدة البيانات | لا تحرير ولا تسليم (البوابة تفشل مغلقة) |
| تعطل التخزين | الرفع يفشل برسالة عربية واضحة بلا سجل معلّق |

## 25. ARCHITECTURE OPTIONS
| المعيار | A — داخل Lovable فقط | B — هجين (Lovable + ماسح سعودي) | C — بنية سعودية كاملة |
|---|---|---|---|
| الأمن | متوسط-عالي (بلا AV حقيقي) | عالي جداً | عالي جداً |
| الخصوصية | ممتازة (لا مغادرة) | جيدة جداً (بنيتنا) | ممتازة |
| التعقيد | منخفض | متوسط | عالي |
| الأداء | ممتاز | جيد | جيد |
| العبء التشغيلي | منخفض | متوسط (تواقيع وقواعد وتوفر) | عالي |
| فئة التكلفة | منخفضة | متوسطة | عالية |
| صعوبة الترحيل | منخفضة | متوسطة | عالية |
| الحدود | لا ClamAV ولا YARA حقيقي داخل Worker | يعتمد على توفر الخدمة وزمن الشبكة | مشروع بنية تحتية مستقل |

**RECOMMENDED_OPTION: B.** الخيار A وحده لا يفي بمنصة قانونية لأنه بلا فحص برمجيات خبيثة حقيقي، والخيار C مشروع أكبر من نطاق الأمن ويؤخر الحماية شهوراً. الخيار B يحقق الحماية الكاملة الآن ويظل مساراً طبيعياً نحو C لاحقاً بلا إعادة تصميم، لأن الحدود بين المكوّنات محكومة بعقود موقّعة.

## 26. PHASED IMPLEMENTATION
| المرحلة | التغييرات | الخطر | Rollback | الاختبارات | Entry | Exit |
|---|---|---|---|---|---|---|
| S0 | جرد نقاط الدخول ونموذج التهديد والسياسات المكتوبة | لا شيء | لا يلزم | مراجعة | اعتماد V2 | جرد مكتمل |
| S1 | جداول الأمان + مخزن الحجر + البصمات الثلاث + آلة الحالات (shadow) | منخفض | إيقاف الميزة والمسار القديم يعمل | نزاهة، حجر، عزل | S0 | كل رفع جديد يولّد سجلاً أمنياً |
| S2 | التحليل البنيوي الداخلي (PDF/OOXML) وحدود الموارد | متوسط | إرجاع النتائج إلى shadow | مجموعة العينات كاملة | S1 | صفر إيجابيات كاذبة على عينة حقيقية |
| S3 | Release Gate وتوحيد كل مسارات التسليم وحارس CI | متوسط | مفتاح off يعيد المسار القديم | اختبارات التجاوز | S2 | صفر مسار تسليم خارج البوابة |
| S4 | ربط الماسح السعودي بوضع Shadow بلا فرض | منخفض | تعطيل الموصل | انتحال وإعادة إرسال الردود | S3 | استقرار أسبوعين |
| S5 | Enforcement (Fail Closed) على E1–E5 | عالي | تخفيض إلى shadow **مع بقاء الجديد محجوراً** | كل اختبارات الأمان | S4 | صفر تحرير بلا قرار |
| S6 | ترحيل الملفات القديمة والمرفقات | متوسط | إيقاف الدفعات | اختبارات Legacy | S5 | `legacy_unscanned = 0` |
| S7 | إعادة الفحص المستمرة والاستجابة الرجعية و Override | منخفض | تعطيل الجدولة | اختبارات إعادة الفحص و IOC | S6 | دورة إعادة فحص ناجحة |
| S8 | CDR (مشتق مطهّر) | متوسط | تعطيل المشتق والعودة للأصل | اختبارات CDR | S7 | جودة المستند محفوظة |

تعديل مقصود على ترتيبك: **Release Gate (S3) قبل الماسح** — البوابة هي الضابط الأهم وتعطي قيمة فورية حتى قبل توفر مكافح الفيروسات.

## 27. ROLLBACK STRATEGY (بلا Fail Open)
مفتاح `FILE_SCAN_ENFORCEMENT` بقيم `off | shadow | enforce`. القاعدة الحاكمة: **التراجع يخفّض مستوى الفحص للملفات الجديدة ولا يمنح أبداً تحريراً لملف غير محرَّر مسبقاً.** إذا تعطل الماسح بعد S5 تبقى الملفات الجديدة في الحجر بحالة «قيد التحقق»، وتبقى الملفات المحرَّرة سابقاً متاحة لأن قرارها موجود ومربوط ببصمتها. لا يوجد أي وضع تشغيل يحوّل `pending` أو `quarantined` إلى متاح. كل تغييرات قاعدة البيانات Additive ولا يُحذف تاريخ الفحص عند التراجع.

## 28. SECURITY TEST PLAN
EICAR فقط (لا برمجيات خبيثة حقيقية) · PDF مزيّف · Polyglot · امتداد مزدوج · MIME mismatch · Magic Bytes mismatch · PDF فيه JavaScript · OpenAction · EmbeddedFile · PDF مشفّر · PDF مشوّه · Office بماكرو · OLE object · External relationship · OOXML تالف · Zip bomb (محاكاة آمنة) · XML bomb (محاكاة آمنة) · عدد صفحات ضخم · ملف صفري · ملف ضخم · اسم Unicode · اسم RTL خادع · Path traversal · بصمة مكررة · بصمة بنتيجة ماسح قديمة · الماسح متوقف · Timeout · رد غير صالح · رد مُعاد إرساله · رد ببصمة خاطئة · رد بمفتاح كائن خاطئ · فحص متزامن · تحرير متزامن · محاولة استبدال الكائن · اختلاف بصمة قبل التحرير · كائن من مكتب آخر · Signed URL مباشر · ملف قديم غير مفحوص · إعادة فحص تحوّل Clean إلى Malicious · Override · فشل CDR · فشل التحرير · فشل التخزين · فشل قاعدة البيانات.
كل حالة يجب أن تنتهي بحالة رفض صريحة، لا بنجاح صامت.

## 29. TARGET ACCEPTANCE CRITERIA (أهداف، غير متحققة اليوم)
UNSCANNED_FILES_RELEASED = 0 · MALICIOUS_FILES_RELEASED = 0 · SUSPICIOUS_FILES_RELEASED = 0 · UNSCANNABLE_FILES_RELEASED = 0 · INTEGRITY_MISMATCH_RELEASED = 0 · FAIL_OPEN_PATHS = 0 · UNPROTECTED_UPLOAD_PATHS = 0 · CROSS_TENANT_FILE_LEAKS = 0 · PUBLIC_QUARANTINE_ACCESS = 0 · DELIVERY_BYPASS_PATHS = 0 · UNSCANNED_FILE_PROCESSING = 0 · LEGACY_UNSCANNED_FILES = 0 · SCAN_RESULTS_WITHOUT_INTEGRITY_BINDING = 0

## 30. RESIDUAL RISKS
ثغرات Zero-day لا تكشفها التواقيع · مستند سليم تقنياً لكنه احتيالي المحتوى · نافذة الستين ثانية لتسريب رابط موقّع · إساءة مستخدم مخوَّل · تلوث سلسلة توريد قواعد الماسح · تعطل الماسح يعطّل الرفع (مقايضة مقصودة لصالح الأمن).

## 31. OPEN QUESTIONS
1. جاهزية بنية الاستضافة السعودية وموعدها التقريبي — تحدد بداية S4.
2. هل يُقبل تأخر ظهور المستند 2–6 ثوانٍ بعد الرفع؟
3. مدة الاحتفاظ بالملفات الخبيثة للتحقيق (المقترح 90 يوماً).
4. من يملك `file_security.override` داخل مِهلة؟
5. هل نسمح مستقبلاً بالأرشيفات و xlsx و pptx؟ (يوسّع نطاق S2).
6. مدة السماح للملفات القديمة أثناء الترحيل (المقترح 30 يوماً).

## 32. الخلاصة
- CURRENT_SECURITY_LEVEL: **MODERATE**
- REVISION_V1_SECURITY_LEVEL: **HIGH** (ناقص: النزاهة، فصل القرار، التاريخ، الاستمرارية)
- REVISION_V2_TARGET_LEVEL: **MAXIMUM / LEGAL-GRADE ZERO-TRUST INGESTION**
- RECOMMENDED_ARCHITECTURE: **OPTION B — Lovable + بوابة ماسح سعودية خاصة، مع Release Gate قبل الماسح**
- REQUIRES_SAUDI_SCANNER = YES
- REQUIRES_DATABASE_CHANGE = YES
- REQUIRES_STORAGE_CHANGE = YES
- REQUIRES_BACKEND_CHANGE = YES
- REQUIRES_FRONTEND_CHANGE = YES
- CAN_BE_IMPLEMENTED_INCREMENTALLY = YES
- REMAINING_CRITICAL_DESIGN_GAPS: جاهزية الماسح السعودي · سياسة الوصول أثناء ترحيل الملفات القديمة · نموذج تسليم CDR (أصل مقابل مطهّر) · حوكمة Override · تشغيل تحديث التواقيع والقواعد.

WAITING_FOR SECURITY ARCHITECTURE REVIEW