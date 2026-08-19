# MEHLA MAXIMUM-ASSURANCE DOCUMENT SECURITY SPECIFICATION — REVISION V5

V5 إضافية فوق V3/V4 ولا تحذف أي ضابط سابق. مراجعة معمارية فقط — لا تنفيذ ولا Migration ولا تغيير تخزين/RLS/أسرار.

## 1. الهدف الأمني
DETECT WHEN POSSIBLE · CONTAIN EVEN WHEN DETECTION FAILS. حتى لو مرّ Zero-day بلا كشف، يجب ألا يصل إلى قاعدة البيانات أو الأسرار أو التخزين الإنتاجي أو مستأجر آخر أو Internal APIs أو Cloud Metadata أو زمن تشغيل التطبيق.

## 2. مناطق الثقة الخمس (نهائية)
```text
ZONE A — التطبيق/مستوى التحكم: لا يلمس بايتات غير موثوقة إطلاقاً
ZONE Q — الحجر: write-once، بلا تسليم، مفتاح منفصل
ZONE H — المعالجة العدائية: Parsers/AV/YARA/Sandbox/CDR، بلا شبكة/أسرار/DB
ZONE D — القرار الأمني: نتائج موقّعة فقط، لا يقرأ بايتات
ZONE R — الإفراج والتسليم: ينفّذ قراراً صالحاً فقط، ولا يستطيع إنشاء قرار
```
حدود الثقة: البايتات A→Q→H فقط؛ النتائج H→D؛ رمز القرار D→R؛ لا مسار عكسي. R لا يعدّل قراراً، D لا يسلّم ملفاً (SEPARATION_OF_DUTIES = TRUE).

## 3. التطبيق لا يفكّك بايتات غير موثوقة
المتصفح → قدرة رفع أحادية الاستخدام → الحجر مباشرة، دون مرور المحتوى بعملية التطبيق. لا فتح PDF ولا فك DOCX ولا إعادة ترميز صور ولا MIME عميق ولا OCR ولا فك ZIP ولا CDR داخل Zone A. UNTRUSTED_BYTES_IN_MAIN_APP = 0. (الوضع الحالي في `intake.server.ts` يقرأ البايتات داخل التطبيق للتحقق من البصمة — يُنقل هذا الفحص إلى Zone H عند التنفيذ.)

## 4. قرار مهيمن بالرفض — FINAL DECISION TRUTH TABLE
| الحالة | النتيجة |
|---|---|
| أي محرك مطلوب: MALICIOUS | BLOCK دائم |
| نتيجة مطلوبة مفقودة | NO RELEASE |
| محرك مطلوب فشل | NO RELEASE |
| محرك مطلوب Timeout | NO RELEASE |
| UNSCANNABLE (مشفّر/تالف/تجاوز حدود) | NO RELEASE |
| عدم تطابق البصمة | PERMANENT BLOCK لهذا الرفع |
| تعارض نتائج مطلوبة | NO RELEASE |
| مشتق بلا إعادة فحص | NO RELEASE |
| تواقيع AV/YARA خارج العمر المسموح | NO NEW RELEASE |
| جميع المحركات المطلوبة نظيفة + بصمة مطابقة + سياسة سارية | CLEAN_UNDER_POLICY_vX |
لا تصويت أغلبية: 3 Clean مقابل 1 Malicious = BLOCK.

## 5. خط أساس إلزامي لكل ملف مهما كان مصدره
Type validation → MIME مستقل → Magic bytes → Polyglot → SHA-256 → Structural → AV → YARA → Integrity → Policy decision. لا يخفَّض الأساس بناءً على تصنيف ذاتي منخفض الخطورة. يُضاف Dynamic Detonation حسب النوع والمصدر والسياسة.

## 6. المصادر الخارجية والتفجير الديناميكي
سياسة موصى بها: كل PDF/Office من رابط عميل مؤقت أو بريد وارد أو أي مصدر خارجي يمر بتحليل ديناميكي بغض النظر عن المؤشرات الساكنة.
- المكسب الأمني: عالٍ (يغطي Zero-day بلا مؤشر ساكن).
- كلفة الأداء: تأخير إضافي عشرات الثواني لكل ملف خارجي؛ يُخفَّف بمعالجة غير متزامنة وإشعار عند الجاهزية.
- الكلفة التشغيلية: بيئات تُنشأ وتُدمَّر لكل ملف + مراقبة + قواعد سلوك.
- التوصية: اعتماد السياسة للمصادر الخارجية، مع استثناء الصور الصغيرة المعاد بناؤها بالكامل (إعادة الترميز تُلغي الحمولة).

## 7. عامل واحد لكل ملف — بلا استثناء
ONE FILE = ONE EPHEMERAL WORKER، يُدمَّر بعد المهمة حتى لو كان الملف نظيفاً، بلا إعادة استخدام لأي ملف آخر.

## 8. MicroVM مقابل Container
| المعيار | Hardened Container | MicroVM |
|---|---|---|
| نطاق الهروب | هروب النواة = مضيف مشترك | حدّ افتراضي، نطاق أضيق |
| زمن الإقلاع | ملي ثانية | مئات ملي ثانية |
| الذاكرة | أقل | أعلى قليلاً |
| الكلفة | أقل | أعلى |
| التشغيل | أبسط | يتطلب مُنسّق مخصص |
التوصية: Container مقسّى (read-only rootfs، non-root، seccomp، بلا قدرات) للفحص الساكن وAV/YARA/Structural؛ MicroVM إلزامياً للتفجير الديناميكي وCDR وأي معالجة لملفات عالية الخطورة إذا توفرت في البنية السعودية.

## 9. استقلالية المحركات وأعطال النمط المشترك
عمال منفصلون، عمليات منفصلة، صور منفصلة، هويات منفصلة، قنوات نتائج منفصلة، بلا نظام ملفات قابل للكتابة مشترك.
COMMON_MODE_FAILURES: نواة واحدة، مستوى تنسيق واحد، وسيط تخزين واحد، مكتبة Parser مشتركة، سجل صور واحد، مصدر تواقيع واحد.
Mitigations: تنويع المكتبات بين المحركات، MicroVM للمحرك الأعلى خطورة، وسيط تخزين منفصل للحجر، سجلّا صور مع تثبيت Digest، مسارات تحديث تواقيع مستقلة، وتعطيل محرك واحد لا يمنح إفراجاً.

## 10. الدفاع ضد False Clean من عامل مخترق
التوقيع يثبت النزاهة لا صحة الحكم. لذلك: مشاهدات مستقلة من عمال منفصلين + سياسة مهيمنة بالرفض + دليل الصندوق الديناميكي + تحقق من التحويل + قناة نتائج لكل محرك. لا عامل واحد يستطيع إنتاج RELEASE_ALLOWED؛ فقط Release Engine بعد رمز قرار صالح من D.

## 11. هوية عمل مؤقتة ووصول لملف واحد
كل عامل يحصل على هوية قصيرة الأجل مرتبطة بـ job_id/scan_id/file_id/expected_sha256/engine/expiry، وتصبح عديمة الفائدة بعد التدمير. لا service role ولا مفتاح تخزين رئيسي: ONE JOB → ONE FILE → ONE READ CAPABILITY ثم الإبطال. يُقيَّم Workload Attestation إن دعمته البنية.

## 12. الشبكة والتخزين المؤقت
Zone H: بلا إنترنت، بلا DNS، بلا Cloud Metadata، بلا شبكة إنتاج داخلية. مراقبة محاولات الاتصال عبر Sinkhole/DNS وهمي/خدمات وهمية معزولة دون سماح فعلي. المساحات المؤقتة: noexec, nosuid, nodev, ephemeral, size-limited؛ بلا mounts مضيفة، بلا Docker socket، بلا privileged.

## 13. المعاينة الآمنة وعزل الأصل
NORMAL_PREVIEW != RAW_ORIGINAL: PDF مسطّح مطهّر، Office عبر معاينة مولّدة خادمياً، صور معاد بناؤها. تُقدَّم المعاينة من Origin منفصل بلا Cookies جلسة مِهلة، مع CSP مقيّدة، nosniff، Content-Type صارم، sandbox، وحد أدنى من CORS/CORP. خطأ في العارض لا يتحول إلى سرقة جلسة.

## 14. سياسة تنزيل الأصل
إذا احتوى الأصل — أو احتوى سابقاً — JavaScript أو ماكرو أو OLE أو ActiveX أو حمولة مضمّنة أو Launch action: NORMAL ORIGINAL DOWNLOAD = DENIED. يبقى الأصل دليلاً بوصول أمني مقيّد فقط.

## 15. كل تحويل ينتج ملفاً غير موثوق
TRANSFORMATION_OUTPUT_IS_UNTRUSTED لكل من CDR وإعادة ترميز الصور وتسطيح PDF وتحويل Office والمعاينة والمصغّرات: كائن جديد، SHA-256 جديد، تحقق نوع، تحقق بنيوي، إعادة AV/YARA، وسجل نسب جديد. TRANSFORM_SUCCESS ≠ TRUST.
سجل النسب (Lineage): parent_file_id, sha256, transformer, transformer_version, created_at, security_decision — لكل مشتق حتى الأصل.

## 16. CSV/XLSX والمحتوى الخطر
سياسة تمنع تحويل التصدير أو المعاينة إلى ناقل تنفيذ: تحييد البادئات (`=`, `+`, `-`, `@`, tab, CR) عند التصدير (مطبّق حالياً في تصدير سجلات التدقيق ويُعمَّم)، منع الروابط الخارجية والمراجع البعيدة وسلوك DDE، تعطيل الصيغ في المعاينة، وعرضها كنص.
تصنيفان منفصلان: MALWARE_SECURITY_RESULT و CONTENT_RISK_RESULT (روابط تصيّد، جمع بيانات اعتماد، موارد بعيدة، قوالب خارجية) — تحذيرات وعزل روابط وتجريد موارد خارجية عند CDR، دون ادعاء كشف كل تصيّد.

## 17. حداثة التواقيع وIOC السريع
MAX_AV_SIGNATURE_AGE و MAX_YARA_RULE_AGE محددان بالسياسة؛ التجاوز = DEGRADED → لا إفراج جديد حتى التحديث، والمنصة تستمر. قبل الفحص الثقيل: مطابقة SHA-256 مع مخزن IOC للحجب المبكر؛ "hash نظيف معروف" لا يعني نظيفاً للأبد، ولا يُكشف وجود بصمة مماثلة عبر المستأجرين.

## 18. تقسية مستوى التحكم وحُزم السياسة الموقّعة
تغييرات السياسة/المنسّق/إعداد القرار/الطابور/قواعد YARA/إصدارات المحركات/Allowlist تتطلب: مصادقة قوية + MFA + سبب + تدقيق غير قابل للتعديل + إصدار + موافقة ثانية + Rollback. لا مسؤول منفرد يعطّل AV ثم يرفع ملفاً.
حزم السياسة موقّعة بـ KMS بإصدار صريح (مثل FILE_SECURITY_POLICY_2026_08_01)؛ كل قرار يسجّل إصداره، ولا يجوز تعديل إصدار قديم مع الإبقاء على رقمه.

## 19. الإنفاذ في قاعدة البيانات وآلة الحالة
قيود قاعدة بيانات تمنع الحالات المستحيلة (malicious/unscannable/integrity_mismatch/uploaded → released) بحيث لا يتجاوزها كود معيب.
```text
uploaded → quarantined → scanning → {decided_clean | blocked | unscannable}
decided_clean → transforming → rescanning → released
released → rescan → {released | blocked}
blocked → incident → evidence_vault → deleted
```
انتقالات ممنوعة: أي قفزة إلى released بلا قرار حالي؛ blocked → released؛ مشتق → released بلا إعادة فحص. نهائية: evidence_vault، deleted.
اختبارات خصائص: forall state != released ⇒ normal_delivery = false.

## 20. الإفراج الذرّي والتسليم المُصادق
Outbox + Compare-and-swap + Idempotency + HASH_AFTER_RELEASE + Reconciliation. نجاح النسخ مع فشل DB = غير قابل للتسليم. DEFAULT RESULT = NOT DELIVERABLE.
التسليم: بلا روابط تخزين مباشرة — المتصفح → تفويض → القرار الحالي → Release Gate → Streaming Proxy → المتصفح، مع إعادة تحقق كل طلب.
سباق التنزيل/إعادة التصنيف: الطلبات الجديدة تُرفض فوراً عند تغيّر القرار، والبث الجاري يُقطع حيثما تسمح البنية، ويُعترف صراحة بأن البايتات التي وصلت فعلاً لا يمكن استرجاعها — تُفتح حالة حادث وتُحدَّد التنزيلات السابقة.

## 21. خزنة الأدلة والحصص
الملفات الخبيثة المؤكدة تنتقل إلى SECURITY EVIDENCE VAULT: بلا تنزيل عادي، بلا AI/OCR/معاينة/فهرسة/مشاركة؛ الوصول عند الحوادث فقط.
حماية استنفاد التخزين: TTL للرفع المهجور/الناقص، حصص لكل توكن/مستخدم/مستأجر، بايت/ساعة، سقف عدد الكائنات، تنظيف المشتقات اليتيمة، ومطابقة دورية.

## 22. حماية التوافر
حصص لكل عامل، تزامن فحص عام وتزامن لكل مستأجر، حدود طابور، Backpressure، Load shedding، Timeouts، Circuit breakers، DLQ. ملف واحد لا يستنفد CPU/RAM/Disk/العمليات/واصفات الملفات/زمن Parser، وآلاف الملفات لا تُسقط المنصة.
FILE_SECURITY_DEGRADED_MODE: قد يتوقف قبول ملفات جديدة أو تبقى محجوزة، بينما تستمر المصادقة والقضايا والعملاء والجلسات والمهل والمهام والدعم. FILE_PIPELINE_FAILURE != PLATFORM_FAILURE.

## 23. FAIL-CLOSED DEPENDENCY MATRIX
| المكوّن المعطّل | الرفع | الفحص | الإفراج | ملفات مُفرج عنها | المنصة |
|---|---|---|---|---|---|
| AV | مقبول إلى الحجر | متوقف | مرفوض | تعمل | تعمل |
| YARA | مقبول | متوقف | مرفوض | تعمل | تعمل |
| Structural | مقبول | متوقف | مرفوض | تعمل | تعمل |
| Sandbox | مقبول | جزئي | مرفوض للخارجي/عالي الخطورة | تعمل | تعمل |
| CDR | مقبول | يكتمل | لا إفراج لما يتطلب تطهيراً | تعمل | تعمل |
| Queue | متوقف مؤقتاً | متوقف | مرفوض | تعمل | تعمل |
| KMS | متوقف | متوقف | مرفوض | تسليم مقيّد | تعمل |
| Database | متوقف | متوقف | مرفوض | متوقف | متأثرة جزئياً |
| Quarantine storage | متوقف | متوقف | مرفوض | تعمل | تعمل |
| Decision Engine | مقبول | يكتمل | مرفوض | تعمل | تعمل |
| Release Service | مقبول | يكتمل | مرفوض | تسليم متوقف | تعمل |
لا يوجد Failure → Allow.

## 24. الوسائط العامة والترويسات وأسماء الملفات
لا كائن عام قبل التحقق والفحص وإعادة البناء الآمن وتحقق المخرجات والإفراج. عند إعادة تصنيف لاحقة: الكائن غير متاح + تنظيف CDN إن دُعم + إبطال النسخة + فتح حادث.
الترويسات: Content-Type موثوق ومتحقق، nosniff، Content-Disposition آمن، اسم ملف UTF-8 منقّى، ومنع التنفيذ الضمني؛ الأصول عالية الخطورة كمرفق لا inline. (الأساس موجود في `security-headers.server.ts` مع CSP ثنائية للمستندات.)
هجمات الأسماء: امتداد مزدوج، Null byte، توحيد Unicode، محارف RTL override، محارف تحكم، أسماء مفرطة الطول، أسماء محجوزة، حقن ترويسات، Path traversal. مفتاح التخزين لا يشتق من اسم الملف الأصلي إطلاقاً.

## 25. سلسلة التوريد والترقيع
إصدارات مثبتة، SBOM، صور موقّعة، تثبيت Digest، فحص ثغرات، Provenance، تحديث متدرّج، Rollback؛ لا `latest` في صور الأمن الإنتاجية.
أهداف داخلية للترقيع: ثغرة Parser حرجة خلال 48 ساعة، ثغرة ماسح حرجة خلال 72 ساعة، ثغرة CDR حرجة خلال 72 ساعة؛ أي إصدار بثغرة حرجة معروفة لا يعمل بلا قرار مخاطرة موثق.

## 26. الاختبار: Fuzzing وخصائص وChaos
Fuzzing مستمر على PDF/OOXML/فك وترميز الصور/CDR/عارض المعاينة/محوّل Office/كاشف MIME/محلل الأسماء + آلة الحالة + محرك القرار.
خصائص أمنية: لا ملف محجوب يصبح مُفرجاً؛ مستأجر A لا يطلب ملف B؛ فحص مطلوب مفقود = رفض؛ مشتق بلا فحص جديد = رفض.
Chaos: قتل عامل/AV/YARA/محرك قرار/خدمة إفراج، KMS معطّل، DB معطّل، بطء تخزين، تشبّع طابور، تحديث سياسة أو تواقيع أثناء الفحص، رسائل مكررة أو خارج الترتيب — النتيجة دائماً Fail Closed مع بقاء المنصة.

## 27. DR للماسح
فقدان كامل لبنية/منطقة الماسح: إعادة بناء بـ IaC، سعة ثانوية، استرجاع الطابور، استرجاع KMS، استرجاع الشهادات، استرجاع القواعد، استرجاع صور الحاويات، استرجاع الإعدادات. أهداف داخلية: RTO ≤ 4 ساعات، RPO ≈ 0 لبيانات الحجر والقرارات (لا تُوصف كـ SLA).

## 28. المواءمة والمعايير
DESIGNED TO ALIGN WITH: NCA ECC، NCA CCC، NCA DCC (أحدث نسخ متاحة وقت التنفيذ) + OWASP ASVS 5.0 Level 3 لمعالجة الملفات + OWASP File Upload Security Guidance. أي رقم أو نص ضابط لم يُتحقق منه رسمياً في هذه الجلسة يُوسَم UNVERIFIED؛ لا ادعاء Compliance.
مصفوفة المواءمة من V4 تبقى سارية مع إضافة عمود Verification = UNVERIFIED للأرقام غير المؤكدة.

## 29. حالة الضوابط
جميع ضوابط V5 حالياً: **DESIGNED**. لا IMPLEMENTED ولا TESTED ولا EVIDENCE_AVAILABLE ولا EXTERNALLY_VALIDATED. لا درجات رقمية بلا أدلة.

## 30. حزمة أدلة التقييم الخارجي وبوابة ما قبل التقييم
الحزمة: المعمارية، حدود الثقة، نموذج التهديد، تدفق البيانات، جرد نقاط الرفع، Allowlist، آلة الحالة، جدول القرار، مصفوفة Fail-Closed، سياسات الشبكة، عزل العمال، سياسات التخزين، اختبارات RLS والمستأجرين، أدلة AV/YARA، نتائج EICAR، اختبارات الصندوق وCDR، نتائج Fuzzing وChaos، اختبارات مقاومة DoS، حواجز CI، أدلة التدقيق، تمرين DR، مواءمة NCA وASVS، المخاطر المتبقية.
قبل الإرسال: Internal Adversarial Test Pack يحاول كسر كل نقاط الرفع والروابط المؤقتة ومسارات التخزين والتسليم والمعاينة وOCR وAI والبريد والعقود والوسائط العامة.

## 31. الثوابت النهائية
UNSCANNED_NORMAL_DELIVERY=0 · MALICIOUS_NORMAL_DELIVERY=0 · SUSPICIOUS_NORMAL_DELIVERY=0 · UNSCANNABLE_NORMAL_DELIVERY=0 · INTEGRITY_MISMATCH_DELIVERY=0 · DIRECT_STORAGE_DOCUMENT_DELIVERY=0 · RAW_UNTRUSTED_APP_PROCESSING=0 · RAW_UNTRUSTED_AI_PROCESSING=0 · RAW_UNTRUSTED_OCR_PROCESSING=0 · CLIENT_LINK_BYPASS=0 · REQUIRED_ENGINE_BYPASS=0 · SINGLE_ENGINE_FALSE_CLEAN_RELEASE=0 · SCANNER_DATABASE_ACCESS=0 · SCANNER_APPLICATION_SECRET_ACCESS=0 · SCANNER_FINAL_STORAGE_ACCESS=0 · SCANNER_GENERAL_INTERNET_EGRESS=0 · SCANNER_OTHER_FILE_ACCESS=0 · SCANNER_CROSS_TENANT_ACCESS=0 · TRANSFORM_OUTPUT_WITHOUT_RESCAN=0 · PUBLIC_MEDIA_WITHOUT_RELEASE=0 · STATE_MACHINE_BYPASS=0 · FAIL_OPEN_PATHS=0 · LEGACY_UNSCANNED_ACCESS_AFTER_ENFORCEMENT=0 · FILE_SECURITY_FAILURE_CAUSES_PLATFORM_FAILURE=0

## 32. أسئلة الفريق الأحمر (PREVENT / DETECT / CONTAIN / RECOVER / EVIDENCE)
- **Malware غير معروف لكل المحركات**: منع بـ Allowlist ضيقة وCDR/إعادة بناء · كشف بالسلوك في الصندوق · احتواء بعامل مؤقت معزول · تعافٍ بإعادة فحص مستمرة وحجب رجعي · دليل: تقرير الصندوق والنسب.
- **Zero-day في Structural Parser**: منع بحدود الموارد والصور المقسّاة · كشف بانهيار/مهلة العامل = UNSCANNABLE · احتواء داخل Zone H بلا شبكة/أسرار · تعافٍ بتدمير العامل وترقيع · دليل: سجل انهيار العامل.
- **استغلال ClamAV نفسه**: نفس الاحتواء؛ نتيجة AV المفقودة أو الشاذة = لا إفراج؛ محركات أخرى مستقلة · دليل: تعارض النتائج مسجّل.
- **اختراق الصندوق الديناميكي**: MicroVM قابلة للتدمير، بلا إنترنت ولا شبكة إنتاج؛ نتيجته وحدها لا تُفرج · دليل: قياسات الهروب وسجل الشبكة الوهمية.
- **اختراق CDR**: المشتق يُعامل غير موثوق ويُعاد فحصه بمحركات أخرى؛ إخراج خبيث = حجب · دليل: بصمة المشتق ونتائج إعادة الفحص.
- **False Clean من عامل**: مشاهدات مستقلة + سياسة الرفض المهيمن + رمز قرار من D فقط · دليل: قنوات النتائج المنفصلة.
- **اختراق Decision Engine**: لا يلمس بايتات، مدخلاته موقّعة، رموز القرار محدودة الصلاحية ومربوطة بالبصمة؛ Release يتحقق من التوقيع والبصمة · تعافٍ: إبطال المفاتيح وإعادة تقييم القرارات الحديثة · دليل: تدقيق متسلسل البصمات.
- **اختراق Release Service**: لا يستطيع إنشاء قرار؛ قيود قاعدة البيانات تمنع حالات مستحيلة؛ التسليم يعيد التحقق من الحالة · دليل: سجلات التسليم.
- **مسؤول يخفّف السياسة عمداً**: موافقة ثانية + MFA + سبب + إصدار موقّع + تدقيق غير قابل للتعديل + Rollback · كشف: تنبيه على أي تخفيف · دليل: تاريخ إصدارات السياسة.
- **مليون Job في الطابور**: حصص ومعدلات وBackpressure وLoad shedding وDLQ؛ الرفع يتوقف والمنصة تعمل · دليل: مقاييس عمق الطابور.
- **ملف 1MB يتمدد 20GB**: حدود نسبة الضغط والعمق والحجم المفكوك وDisk quota → UNSCANNABLE · دليل: سجل تجاوز الحدود.
- **عميل بتوكن رفع صالح**: التوكن يمنح إيداعاً في الحجر فقط، بحصص وانتهاء واستخدام محدود؛ لا تسليم · دليل: أحداث الطلب والحصص.
- **مطوّر يضيف Endpoint جديد**: حواجز CI تُفشل البناء عند أي مسار رفع/تنزيل/AI/OCR/Bucket عام لا يمر ببوابة الأمن · دليل: تقرير الحواجز.
- **Clean يصبح Malicious بعد شهر**: إعادة فحص مستمرة، حجب فوري، إبطال قدرات التسليم، بحث IOC، حادث، تحديد التنزيلات السابقة · دليل: سجل إعادة التصنيف.
- **اختلاف حالة التخزين وقاعدة البيانات**: Outbox + CAS + مطابقة دورية؛ الافتراضي غير قابل للتسليم · دليل: تقارير المطابقة.
- **KMS غير متاح**: لا إفراج ولا فك تشفير جديد؛ المنصة تعمل؛ تعافٍ عبر خطة استرجاع KMS · دليل: سجل الحالة المتدهورة.
- **تعطّل الماسح السعودي كلياً**: الرفع متوقف أو الملفات محجوزة، لا إفراج؛ سعة ثانوية وDR بأهداف داخلية · دليل: تمرين DR.

## 33. الخلاصة
V3_V4_CONTROLS_PRESERVED = YES
TRUST_ZONES_FINALIZED = YES (خمس مناطق)
DENY_DOMINANT_DECISION = YES
ONE_FILE_ONE_WORKER = YES
ZERO_DAY_CONTAINMENT_DESIGNED = YES
FALSE_CLEAN_DEFENSE_DESIGNED = YES
CONTROL_PLANE_HARDENED = YES (تصميماً)
SAFE_PREVIEW_DESIGNED = YES
TRANSFORM_RESCAN_REQUIRED = YES
FAIL_CLOSED_MATRIX_COMPLETE = YES
OWASP_ASVS_L3_FILE_HANDLING_MAPPED = YES (مواءمة تصميمية، بنود غير مُتحقق منها موسومة UNVERIFIED)
SAUDI_NCA_MAPPING_COMPLETE = YES (DESIGNED TO ALIGN WITH؛ أرقام الضوابط UNVERIFIED)
CRITICAL_DESIGN_GAPS = لا حجر منفصل ولا حالة فحص في المخطط الحالي؛ لا ماسح/صندوق مُشغَّل؛ لا بوابة تسليم موحدة مفروضة؛ التحقق من البايتات ما زال داخل التطبيق
HIGH_DESIGN_GAPS = Legacy غير مجرود؛ الوسائط العامة بلا فحص؛ لا حصص لكل توكن؛ لا Origin معزول للمعاينة؛ Allowlist المستندات أوسع من مرفقات البريد؛ لا سجل نسب
UNPROVEN_SECURITY_ASSUMPTIONS = توفر مزود ماسح سعودي بـ mTLS؛ توفر MicroVM في البنية السعودية؛ جدوى عامل مؤقت لكل ملف على البنية الحالية؛ دقة CDR على مستندات عربية معقّدة؛ كلفة التحليل الديناميكي لكل ملف خارجي
SECURITY_CONTROLS_DESIGN_COMPLETE = YES
READY_TO_FREEZE_ARCHITECTURE = YES
READY_FOR_IMPLEMENTATION = NO
READY_FOR_EXTERNAL_SECURITY_TEST = NO

WAITING FOR FINAL SECURITY ARCHITECTURE REVIEW

---

# V5 FINAL — ARCHITECTURE FREEZE CANDIDATE (ADDENDUM)

## A1. لا ثقة منفردة بمحرك القرار
مسار الإفراج النهائي:
```text
SCAN EVIDENCE → DECISION ENGINE → DECISION_TOKEN
                INDEPENDENT EVIDENCE VERIFIER → EVIDENCE_ATTESTATION
                (+ CURRENT POLICY) → RELEASE GATE
```
VALID SIGNATURE ≠ TRUSTED DECISION. الإفراج يتطلب الرمزين معاً؛ رمز واحد = لا إفراج.

## A2. RELEASE_AUTHORIZATION = 2 OF 2
A = محرك القرار، B = مدقّق الأدلة المستقل؛ لكل منهما هوية خدمة ومفتاح توقيع KMS وسياسة تفويض وسجل تدقيق منفصلة. اختراق أحدهما وحده = لا إفراج. أي اختلاف = NO RELEASE. لا أغلبية.

## A3. مدقّق الأدلة يعيد حساب السياسة
يقرأ Metadata موقّعة فقط (لا بايتات) ويتحقق بنفسه من: حضور كل المحركات المطلوبة، غياب نتيجة خبيثة، لا Timeout، لا محرك فاشل، لا UNSCANNABLE، اتساق البصمات، إصدار السياسة الحالي، حداثة التواقيع، سلسلة النسب، واكتمال إعادة الفحص المطلوبة.

## A4. تقسية رمز الإفراج
مربوط بـ: file_id, organization_id, sha256, security_decision_id, evidence_bundle_id, policy_version, purpose, issued_at, expires_at, audience, issuer, jti/nonce. لا يصلح لملف/مكتب/غرض آخر، ولا يُعاد استخدامه بعد الاستهلاك.

## A5. لا قراءة على مستوى المخزن لخدمة الإفراج
OBJECT-SCOPED DELIVERY CAPABILITY: ملف واحد، مكتب واحد، غرض واحد، مدة قصيرة جداً. لا مفتاح تخزين رئيسي ولا service role واسع. COMPROMISED_RELEASE_SERVICE ≠ ALL_DOCUMENTS_EXPOSED.

## A6. عدم قابلية تعديل الحجر فعلياً
`upsert=false` في الكود غير كافٍ. الضوابط: Object Lock/immutability على مستوى المخزن إن توفر، وإلا: إلغاء صلاحية UPDATE، توليد كائن فريد لكل رفع، هوية معنونة بالمحتوى (sha256)، هوية منفصلة للحذف/الاحتفاظ، ومرجع إصدار كائن ثابت. بعد UPLOAD_COMPLETE لا هوية تشغيلية طبيعية تستطيع تعديل نفس البايتات؛ أي استبدال = INTEGRITY INCIDENT.

## A7/A8. الانتقالات مفروضة من قاعدة البيانات
تصميم: دالة انتقال محكومة `approved_security_transition(...)` (SECURITY DEFINER) + Trigger يرفض أي UPDATE مباشر على عمود الحالة + عمود version للـ CAS + سحب صلاحية UPDATE على عمود الحالة من دور التطبيق + تقسيم هويات الخدمات. الدالة تتحقق من الحالة الحالية والهدف والقرار والأدلة والبصمة والسياسة. Invariant: DIRECT_SECURITY_STATE_UPDATE = IMPOSSIBLE.

## A9. محرك خبيث ثانٍ مستقل
مطلوب AV ENGINE A + AV ENGINE B (محركان مختلفان فعلاً، لا نفس المحرك مرتين) لكل PDF/DOCX/XLSX من المشترك أو الرابط المؤقت أو البريد الوارد أو التكاملات. الحالة الآن: **HIGH IMPLEMENTATION GAP** — لا يُدّعى Multi-Engine Malware Detection قبل توفره.

## A10. السياسة الأعلى للمستندات الخارجية
Structural + AV-A + AV-B (إن توفر) + YARA + Dynamic Detonation + CDR للأنواع المناسبة + إعادة فحص المخرجات. لا مصنّف مخاطر يخفّض هذا الأساس.

## A11. مقاومة تحايل الصندوق
تسريع الزمن، محاكاة تفاعل مستخدم، ملفات تعريف صندوق متعددة، ارتباط سلوكي، كشف بيئة وهمية، مهل ممتدة للتنفيذ الشرطي. لا يُدّعى كشف كل Malware متحايل؛ عدم الحسم = لا إفراج للمستندات الخارجية.

## A12. MicroVM بوابة أمنية لا خياراً
في Maximum Assurance Mode: إذا لم تتوفر عزلة VM/MicroVM المعتمدة للتفجير عالي الخطورة فإن HIGH_RISK_DYNAMIC_RELEASE = DISABLED. لا تخفيض صامت للمستوى الأمني.

## A13. تقسية ZIP داخل OOXML
رفض: symlinks، hardlinks، مدخلات أجهزة، مسارات مطلقة، `../`، Zip Slip. حدود: أقصى عدد مدخلات، أقصى حجم مفكوك، أقصى تعشيش، أقصى نسبة ضغط. أي خرق = BLOCK/UNSCANNABLE. (يبني على `zipEntryNames` الحالي مع نقله إلى Zone H.)

## A14. الكشف التفاضلي للمحللات
اختلاف جذري بين كاشف MIME والمحلل البنيوي وكاشف البصمة على نوع الملف = PARSER_DISAGREEMENT → SUSPICIOUS → NO RELEASE، ويُسجّل كدليل أمني. لا اختيار "النتيجة المريحة".

## A15. الهوية المعنونة بالمحتوى
sha256 جزء من الهوية الداخلية غير القابلة للتغيير للملف/الإصدار؛ أي محتوى جديد = كائن/إصدار جديد؛ لا تعديل in-place بعد بدء الفحص.

## A16. OWASP ASVS 5.0.0 CROSSWALK (معرّفات النسخة الرسمية غير مُتحقَّق منها في هذه الجلسة = UNVERIFIED)
| Requirement (v5.0.0-\<req\>) — UNVERIFIED IDs | الضابط المعماري | المكوّن | الاختبار | الدليل | الحالة |
|---|---|---|---|---|---|
| File Upload — حد الحجم | حد 20MB + حصص | بوابة الرفع | اختبار تجاوز | سجل رفض | DESIGNED |
| File Upload — تحقق النوع/المحتوى | MIME مستقل + Magic + Polyglot | Zone H | ملف متنكر | تقرير فحص | DESIGNED |
| File Upload — حدود المحتوى المضغوط | حدود OOXML/ZIP | Structural | Zip bomb | سجل حدود | DESIGNED |
| File Upload — حصص المستخدم | حصص توكن/مستخدم/مستأجر | مستوى التحكم | إساءة رفع | مقاييس | DESIGNED |
| File Storage — symlink | رفض symlink/traversal | Structural | Zip Slip | سجل خرق | DESIGNED |
| File Storage — pixel flood | حدود أبعاد وبكسل | Image worker | قنبلة صورة | سجل حدود | DESIGNED |
| File Storage — مسارات آمنة | مفتاح مولّد خادمياً | الحجر | Path traversal | سجل مسار | DESIGNED |
| File Storage — منع تنفيذ خادمي | noexec + مخزن خاص | Zone Q/H | محاولة تنفيذ | سياسة mount | DESIGNED |
| File Download — أسماء آمنة | تنقية UTF-8 + Disposition | Zone R | هجمات الأسماء | ترويسات | DESIGNED |
| File Download — فحص مضاد للفيروسات | AV-A/AV-B + YARA | Zone H | EICAR | تقرير فحص | DESIGNED |
الحالة العامة: DESIGNED (لا Passed).

## A17. NCA CROSSWALK + APPLICABILITY
| الإطار | Applicability |
|---|---|
| ECC 2-2024 | REQUIRES_LEGAL_OR_COMPLIANCE_CONFIRMATION |
| CCC-2:2024 | APPLICABLE (خدمات سحابية) |
| DCC-1:2022 | REQUIRES_LEGAL_OR_COMPLIANCE_CONFIRMATION |
| ضوابط القطاع الخاص من غير ذوات البنى التحتية الحساسة — 2025 | REQUIRES_LEGAL_OR_COMPLIANCE_CONFIRMATION |
لا افتراض نطاق، ولا استخدام لكلمة COMPLIANT؛ أرقام ونصوص الضوابط غير المؤكدة = UNVERIFIED.

## A18–A20. سيناريوهات اختراق مستوى التحكم
- **Release Service مخترقة بالكامل**: لا قدرة على ملف مستأجر آخر ولا ملف مُفرج عنه عشوائي ولا ملف محجوز ولا ملف خزنة الأدلة؛ لا تجاوز لمدقّق الأدلة؛ رمز القرار لا يُعاد استخدامه (jti + استهلاك). نطاق الانفجار = الملف الجاري تسليمه فقط.
- **Decision Engine يصدر CLEAN كاذباً**: مدقّق الأدلة يعيد الحساب ويرفض → FALSE_DECISION_RELEASE = 0.
- **Evidence Verifier مخترق ومحرك القرار يرفض**: 2-of-2 غير مكتملة → SINGLE_CONTROL_PLANE_COMPROMISE_RELEASE = 0.

## A21. دليل اختراق المفاتيح
لمفتاح توقيع القرار، مفتاح توقيع الأدلة، مفتاح mTLS، هوية الماسح: Revoke فوري → Rotate → إبطال كل القدرات القائمة → تحديد القرارات المتأثرة → إعادة تقييم الملفات الحديثة → حفظ أدلة الحادث، مع تعليق الإفراج حتى اكتمال التدوير.

## A22. نزاهة الوقت
مصدر وقت موثوق ومزامنة NTP مصدّقة، رفض الرموز عند انحراف يتجاوز الحد، تحقق مزدوج للانتهاء في المُصدر والمستهلك، nonce/jti مخزّن لمنع Replay؛ الانحراف الكبير = Fail Closed لا قبول رمز منته.

## A23. صلابة وسيط التسليم
حساب منفصل (Bulkhead)، بث بلا تخزين كامل في الذاكرة، حدود نطاق ترددي وزمن، حدود تزامن، سياسة Range صارمة، تحكم بمعدل التنزيل. تعطّله لا يُسقط التطبيق الرئيسي.

## A24. ثوابت التجميد الإضافية
FALSE_DECISION_ENGINE_RELEASE=0 · FALSE_EVIDENCE_VERIFIER_RELEASE=0 · SINGLE_CONTROL_PLANE_COMPROMISE_RELEASE=0 · RELEASE_SERVICE_BUCKET_WIDE_ACCESS=0 · QUARANTINE_OBJECT_OVERWRITE_AFTER_UPLOAD=0 · DIRECT_SECURITY_STATE_UPDATE=0 · OOXML_SYMLINK_ACCEPTANCE=0 · OOXML_PATH_TRAVERSAL=0 · PARSER_DISAGREEMENT_FAIL_OPEN=0 — إضافة إلى كل ثوابت V3/V4/V5.

## A25. قرار التجميد
FINAL_CRITICAL_DESIGN_GAPS = لا حجر غير قابل للتعديل ولا حالة فحص في المخطط الحالي؛ لا ماسح/صندوق مُشغَّل؛ لا بوابة تسليم موحدة مفروضة؛ التحقق من البايتات ما زال داخل التطبيق؛ لا دالة انتقال محكومة في قاعدة البيانات
FINAL_HIGH_DESIGN_GAPS = لا محرك AV ثانٍ مستقل؛ Legacy غير مجرود؛ الوسائط العامة بلا فحص؛ لا حصص لكل توكن؛ لا Origin معزول للمعاينة؛ لا سجل نسب؛ Allowlist المستندات أوسع من مرفقات البريد
UNPROVEN_INFRASTRUCTURE_ASSUMPTIONS = توفر MicroVM في البنية السعودية؛ توفر Object Lock على مستوى المخزن؛ توفر قدرات قراءة معنونة بالكائن؛ توفر مزود ماسح سعودي بـ mTLS ومحركين مستقلين؛ جدوى عامل مؤقت لكل ملف؛ دقة CDR على مستندات عربية معقّدة
V5_FINAL_SECURITY_CONTROLS_DESIGNED = YES
ARCHITECTURE_CAN_BE_FROZEN = YES
IMPLEMENTATION_PLAN_CAN_BEGIN = YES

**MEHLA DOCUMENT SECURITY ARCHITECTURE FROZEN**

WAITING FOR IMPLEMENTATION SECURITY PLAN APPROVAL
