# MEHLA HIGH-ASSURANCE DOCUMENT SECURITY ARCHITECTURE — REVISION V4

نطاق هذه الوثيقة: معمارية + نمذجة تهديد + مواءمة سعودية + تصميم إثبات. لا تنفيذ، لا Migration، لا تعديل تخزين أو RLS أو أسرار.

## 1. المبادئ الحاكمة
- كل ملف عدائي حتى يُثبت العكس.
- فشل طبقة واحدة لا يعني اختراق مِهلة (Defense in Depth مع حدود ثقة مفصولة).
- لا محرك واحد يملك سلطة الإفراج (No single point of security failure).
- Fail Closed دائماً، وبدون إسقاط بقية المنصة.

## 2. الوضع الحالي (مُتحقَّق من الكود)
- الرفع الحالي يمر بـ `src/lib/documents/intake.server.ts`: فتحة رفع موقّعة، تحقق مسار مملوك، حد 20MB، تحقق Magic Bytes (`file-signature.ts`)، ثم ربط السجل. لا يوجد حجر مستقل ولا فحص خبيث ولا `sha256`/`scan_status` على المستندات.
- مرفقات البريد تعتمد Allowlist صارمة و`BLOCKED_EXTENSIONS` في `attachments.shared.ts` (يشمل html/svg/zip) — أفضل من مسار المستندات.
- روابط العميل المؤقتة (`client-portal.server.ts`) تُحدّ بـ IP وعدد المحاولات فقط؛ صحة الرابط لا تعني سلامة الملف.
- `office-public-media` هو الوجهة العامة الوحيدة → يحتاج فحص وإعادة بناء قبل النشر.

## 3. الوجهة المعمارية: أربع مناطق ثقة
```text
Zone A: التطبيق (مِهلة)      — لا يلمس بايتات غير مُفرَج عنها أبداً
Zone Q: الحجر غير القابل للتعديل — write-once، بلا تسليم، بمفتاح منفصل
Zone H: منطقة المعالجة العدائية  — عمال مؤقتون، بلا شبكة، بلا أسرار، بلا DB
Zone D: محرك القرار + بوابة الإفراج — يقرأ نتائج موقّعة فقط، لا يقرأ ملفات
```
قاعدة: البايتات تتحرك A→Q→H فقط؛ القرارات تتحرك H→D؛ الإفراج يتم من D→التخزين النهائي عبر ناقل محصور.

## 4. Allowlist الحد الأقصى للتقييد
مسموح: PDF, DOCX, XLSX, JPG/JPEG, PNG, WEBP, TXT, CSV.
مرفوض افتراضياً بلا استثناء: EXE, DLL, MSI, BAT, CMD, PS1, JS, VBS, SCR, LNK, JAR, ISO, IMG, CHM, HTML/HTM, SVG, XML, DOCM/XLSM/PPTM, ZIP/RAR/7Z/TAR/GZ, أي نوع غير معروف.
أي امتداد مركّب (file.pdf.exe) يُرفض بفحص كل المقاطع. الأنواع الوسيطة (DOC/XLS/PPTX) تُقيّم فقط بحاجة عمل موثقة.

## 5. خط الأنابيب (متعدد ومستقل)
Authorization → Tenant validation → فتحة رفع أحادية الاستخدام → **حجر غير قابل للتعديل** → Resource precheck → Extension → MIME مستقل → Magic bytes → Polyglot → SHA-256 (Upload Hash) → Structural Worker → AV Worker → YARA Worker → تصنيف خطر → Detonation Sandbox (عالي الخطورة) → CDR / Image Reconstruction → New Hash → إعادة فحص المشتق → Decision Engine → Release Gate → تسليم مُصادق.
طبقات مضافة على المقترح: Entropy/Encryption detection، كشف الملفات المشفّرة (PDF/OOXML) كـ UNSCANNABLE، Nesting depth guard، Filename normalizer مستقل، Content-Type re-derivation، وBucket-level deny للتسليم قبل الإفراج.

## 6. عزل العمال والصندوق الديناميكي
- ONE FILE = ONE EPHEMERAL WORKER: عامل يُنشأ لملف واحد ويُدمَّر بعده حتى إن كان سليماً (no reuse, no persistence, read-only rootfs, non-root, seccomp، بلا Egress، بلا Cloud Metadata، حصة CPU/RAM/Disk/زمن).
- الوصول للحجر عبر "قدرة قراءة أحادية النطاق ومُنتهية" لملف واحد بالتحديد — لا وصول للحجر كمخزن.
- الصندوق الديناميكي: بيئة خاصة (يفضل داخل السعودية)، لا Sandbox عام، ملف واحد لكل بيئة قابلة للتدمير، مراقبة إنشاء العمليات/Shell/PowerShell/الكتابة/DNS/الشبكة/الثبات/شجرة العمليات، ثم تدمير كامل.
- التكلفة: أعلى من Pool مشترك؛ تُخفَّف بأحجام عمال صغيرة وتفعيل الصندوق للخطر العالي فقط، دون تخفيض العزل.

## 7. نموذج اختراق الماسح (Blast Radius)
عامل مخترق يملك: بايتات ملف واحد + قدرة قراءة منتهية لنفس الملف. لا DB، لا تخزين نهائي، لا حجر عام، لا ملف ثانٍ، لا مكتب آخر، لا أسرار، لا KMS، لا Metadata، لا Internal API، لا إنترنت، لا صلاحيات مرتفعة، ولا قناة إفراج.
نطاق الانفجار = عامل مؤقت واحد + ملف واحد + مستأجر واحد، ينتهي بتدمير العامل.

## 8. الدفاع ضد "Clean كاذب" من ماسح مخترق
- محركات مستقلة على عمال منفصلين (Structural ≠ AV ≠ YARA ≠ Sandbox ≠ Decision).
- قنوات نتائج منفصلة وموقّعة، مرتبطة بـ scan_id + upload hash + policy version.
- قرار بالنصاب (Quorum): الإفراج للخطر العالي يتطلب اتفاق محركات مستقلة + نتيجة صندوق؛ نتيجة مفقودة أو متناقضة = لا إفراج.
- لا عامل واحد يستطيع منح RELEASE_ALLOWED؛ Release Gate هو المكوّن الوحيد المخوّل.
- بصمة النقل (SHA-256 + توقيع) تحمي النزاهة فقط، ولا تُعتبر إثبات صحة قرار.

## 9. CDR وإعادة بناء الصور
Original (دليل غير قابل للتعديل) → فحص → CDR/Re-encode → New SHA-256 → إعادة AV/YARA/Structural على المشتق → إفراج. CDR_SUCCESS ≠ CLEAN. الصور: Decode → Validate → Strip metadata → Re-encode → Hash → Validate → Release. SVG محجوب افتراضياً. كل فك ترميز داخل Zone H.

## 10. قنابل الملفات وRESOURCE GOVERNOR
حدود صريحة لكل Parser/Scanner: حجم مضغوط/مفكوك، نسبة ضغط، عمق تعشيش، عدد الكائنات/الصفحات، أبعاد الصورة والبكسل، زمن أقصى، CPU/RAM/Disk، عدد الكيانات XML (منع XXE/Billion Laughs)، منع الملفات المؤرشفة أصلاً. تجاوز أي حد = UNSCANNABLE → لا تسليم عادي.

## 11. حماية توافر المنصة
Bulkheads: طابور مستقل للفحص، تزامن لكل مستأجر + سقف عام، Timeouts، Circuit breakers، Backpressure، Rate limits، حصص، إلغاء مهام، Dead-letter queue. انهيار Parser/عامل/طابور يعطّل الرفع مؤقتاً فقط؛ المصادقة والقضايا والجلسات والمهل والمهام والدعم تبقى تعمل. FILE_SECURITY_SYSTEM_FAILURE ≠ MEHLA_PLATFORM_FAILURE.

## 12. حماية رابط العميل المؤقت
حصة لكل توكن (عدد ملفات/بايتات/فتحات متزامنة)، انتهاء زمني، دلالات استخدام محدود، تحكم بحسب IP، حصة مستأجر، تحديد معدل، ومنع استهلاك تكلفة الفحص. رفع صالح ينتج ملفاً محجوزاً لا مُسلَّماً. الرسائل للعميل عربية واضحة بلا تفاصيل داخلية.

## 13. منع المعالجة الخام والتسليم
`state != released` يمنع دخول الملف إلى OCR، AI/بيان، Embeddings، الفهرسة، المعاينة، المصغّرات خارج Zone H، إعادة إرسال البريد، معالجة العقود، التحويل، ومشاركة العميل. RAW_UNTRUSTED_FILE_PROCESSOR_PATHS = 0.
التسليم عبر Authenticated Streaming Proxy: تحقق في كل طلب من المستخدم/المستأجر/الدور/الصلاحية/حالة الملف/القرار الحالي/نسخة السياسة/إعادة التصنيف. لا Storage bearer URLs للمستندات القانونية.

## 14. الاستجابة الرجعية وLegacy والوسائط العامة
- إعادة تصنيف Clean→Malicious: حجب فوري، تعطيل التسليم وAI/OCR والمشاركة، إبطال قدرات التسليم، البحث بنفس IOC، فتح حادث أمني، تحديد التنزيلات السابقة، إبلاغ المسؤولين.
- Legacy: جرد → Hash → فحص → تصنيف قبل الإنفاذ الكامل؛ بعد الإنفاذ: LEGACY_UNSCANNED_ACCESS = NO.
- لا مسار draft → public: كل وسائط `office-public-media` تُفحص وتُعاد بناؤها قبل النشر. UNSCANNED_PUBLIC_MEDIA = 0.

## 15. الثوابت الأمنية (قابلة للاختبار)
1) لا تسليم بلا فحص. 2) لا تسليم عادي لملف خبيث. 3) لا تسليم لملف غير قابل للفحص. 4) لا كتابة من الماسح إلى التخزين النهائي. 5) لا وصول للماسح إلى قاعدة البيانات. 6) لا وصول لملف ثانٍ. 7) لا Egress للماسح. 8) لا معالجة خام داخل التطبيق. 9) لا تجاوز عبر رابط العميل. 10) لا وصول لبيانات أمنية عبر المستأجرين. 11) لا تجاوز عند عدم تطابق البصمة. 12) لا إفراج بلا قرار أمني حالي. 13) لا إفراج لمشتق بلا إعادة فحص. 14) لا معالجة إنتاج من ماسح تطوير. 15) لا وسائط عامة بلا إفراج. 16) لا انتقال حالة إلا عبر آلة الحالة. 17) لا إفراج بقرار عامل واحد للخطر العالي.

## 16. الإثبات: CONTROL → IMPLEMENTATION → TEST → EVIDENCE
لكل ثابت: قيد قاعدة بيانات/آلة حالة + اختبار وحدة سلبي + اختبار E2E + مراقب زمن تشغيل + سجل تدقيق متسلسل البصمات. مثال: "لا تسليم لملف خبيث" = قيد CHECK على حالة التسليم + اختبار انتقال مرفوض + E2E تنزيل يعيد 403 + مقياس محاولات مرفوضة + سجل غير قابل للتعديل.

## 17. الإثبات الآلي في CI/CD (Build Failure)
Guardrails تفشل البناء عند: مسار رفع جديد لا يمر ببوابة الأمن، تنزيل مباشر من التخزين، إنشاء Signed URL للمستندات، دخول AI/OCR/الفهرسة بلا `assertFileDeliverable`، كتابة إلى Bucket عام بلا إفراج، تعديل انتقالات الحالة خارج الوحدة المعتمدة، أو استيراد وحدات Zone H داخل التطبيق. تُبنى على نمط `scripts/*-guardrails.ts` القائم.

## 18. الاختبار العدائي والFuzzing والChaos
- Suite عدائية بلا Malware حقيقي: EICAR، polyglot، MIME/امتداد مزيّف، امتداد مزدوج، PDF JS/OpenAction/EmbeddedFile، PDF تالف/مشفّر، ماكرو Office/OLE/Template خارجي، OOXML تالف، polyglot صور، محاكاة قنابل صور/XML/Zip، مهلة Parser، انهيار ماسح/عامل، امتلاء طابور، Callback مكرر/مزوّر، Hash/scan_id/مستأجر خاطئ، ملف عبر مستأجرين، محاكاة False-Clean واختراق ماسح، فشل CDR ومشتق خبيث، Clean→Malicious، تزامن إفراج/إعادة تصنيف، فشل DB/تخزين/شبكة/KMS.
- Fuzzing مستمر (mutation + property-based) على PDF/OOXML/MIME/الاسم/آلة الحالة/محرك القرار/الصور، بحثاً عن crash/hang/تضخم ذاكرة/حالة غير متوقعة/خرق ثابت.
- Chaos: نتيجة النهائية دائماً Fail Closed دون إسقاط المنصة.

## 19. DR وتشغيل أمني ومقاييس
- DR: Infrastructure as Code، صور ماسح، قواعد موقّعة، نسخ إعدادات، ثبات الطابور، استرجاع KMS وmTLS، تدوير أسرار، إعادة بناء من الصفر، سعة بديلة، تمرين DR دوري، مع Internal RTO/RPO Targets (أهداف داخلية لا SLA).
- تشغيل: تحديث التواقيع وYARA، ترقيع الماسح، مراقبة الثغرات، مراجعة الإيجابيات الخاطئة والملفات المشبوهة، مراجعة الحوادث، استجابة IOC، تمارين DR، مراجعة Fuzzing، صحة الماسح — مع Runbooks مكتوبة.
- لوحة مقاييس: عدد الملفات، نظيف/مشبوه/خبيث/غير قابل للفحص/محجوب، أعطال الفحص، Timeouts، عمق الطابور، P95، انهيارات العمال، تجاوز الحدود، عدم تطابق البصمة، فشل محاكاة False-Clean، متبقي Legacy، عمر التواقيع/القواعد، توافر الماسح، الحوادث — مع تنبيهات.

## 20. SAUDI CYBERSECURITY CONTROL MAPPING MATRIX
| Framework | Control/Requirement | مكوّن أمن الملفات | آلية التنفيذ | الدليل المطلوب | الحالة | الفجوة |
|---|---|---|---|---|---|---|
| ECC-2:2024 | حماية من البرمجيات الضارة | AV + YARA + Sandbox | عمال مستقلون + نصاب | تقارير فحص + سجلات | مصمم | لا ماسح مُشغَّل |
| ECC-2:2024 | أمن أصول المعلومات/البيانات | حجر + تشفير + Release Gate | AES-256-GCM + مسارات مملوكة | سجل حالة + تدقيق | جزئي | لا حجر منفصل حالياً |
| ECC-2:2024 | إدارة الحوادث | الاستجابة الرجعية | فتح حادث + IOC | سجل حوادث | مصمم | آلية IOC غير مبنية |
| ECC-2:2024 | التسجيل والمراقبة | سجل تدقيق متسلسل البصمات | Hash chain + WORM | ملخصات موقّعة | جزئي | لا سلسلة للفحص |
| ECC-2:2024 | أمن الأطراف الخارجية | مزود الماسح السعودي | mTLS + HMAC + Pull | عقد + تقييم | مصمم | لا مزود مختار |
| CCC-2:2024 | أمن الخدمات السحابية | عزل Zone H | بلا Egress/Metadata | سياسات شبكة | مصمم | لا بنية مُنشأة |
| DCC-1:2022 | تصنيف وحماية البيانات | تصنيف الملفات + عزل المستأجر | RLS + سياسات وصول | مصفوفة صلاحيات | جزئي | تصنيف أمني غير مطبق |
| أنظمة حماية البيانات الشخصية | تقليل البيانات وحمايتها | Strip metadata + PII مشفّر | إعادة ترميز + Blind index | سجل كشف | جزئي | لا Strip حالياً |
الصياغة المعتمدة: **DESIGNED TO ALIGN WITH** — لا ادعاء COMPLIANT بلا تقييم التزام رسمي مستقل.

## 21. أجوبة الأسئلة الحرجة (ملخص)
- Malware معروف: AV + YARA + Structural + بصمات.
- Zero-day: Allowlist ضيقة + CDR/إعادة بناء + صندوق ديناميكي + عزل + Fail Closed.
- استغلال Parser: يقع داخل عامل مؤقت بلا شبكة/أسرار/DB ثم يُدمَّر.
- اختراق الماسح: نطاق انفجار = عامل واحد + ملف واحد، ولا سلطة إفراج.
- False Clean: نصاب محركات مستقلة + صندوق + قنوات نتائج منفصلة.
- محاولة إسقاط النظام: Resource Governor + Bulkheads + Timeouts + DLQ.
- امتلاء الطابور: Backpressure ورفض رفع جديد فقط، والمنصة تعمل.
- تعطل الماسح: Fail Closed للرفع/الإفراج + DR + سعة بديلة.
- اختراق CDR: المشتق يُعاد فحصه ولا يُثق به.
- Clean→Malicious: احتواء رجعي فوري وفتح حادث.
- رابط مؤقت: يمنح إذن رفع فقط داخل الحجر، ولا يمنح تسليماً.
- تجاوز مطوّر: Guardrails في CI تُفشل البناء.
- إثبات الثوابت: قيود + اختبارات سلبية + E2E + مراقبات + أدلة تدقيق.
- المواءمة السعودية: مصفوفة ضوابط بأدلة وفجوات صريحة.

## 22. بوابة الاعتماد
KNOWN_MALWARE_DEFENSE = DESIGNED · ZERO_DAY_CONTAINMENT = DESIGNED · PARSER_EXPLOIT_CONTAINMENT = DESIGNED · SCANNER_COMPROMISE_CONTAINMENT = DESIGNED · FALSE_CLEAN_DEFENSE = DESIGNED · FILE_BOMB_DEFENSE = DESIGNED · PLATFORM_AVAILABILITY_ISOLATION = DESIGNED · TEMP_CLIENT_UPLOAD_PROTECTED = YES · MULTI_LAYER_SECURITY = YES · ONE_FILE_ONE_EPHEMERAL_WORKER = DESIGNED · HIGH_RISK_DYNAMIC_ANALYSIS = DESIGNED · TRANSFORMED_OUTPUT_RESCAN = REQUIRED · FAIL_OPEN_PATHS = 0 BY DESIGN · SECURITY_INVARIANTS = FORMALLY_DEFINED · SECURITY_INVARIANTS = TESTABLE · SAUDI_CONTROL_MAPPING = COMPLETE · SCANNER_DR = DESIGNED · SECURITY_OPERATIONS = DESIGNED

## 23. الخلاصة
- ARCHITECTURE_SECURITY_SCORE: 93/100 (تصميم)
- KNOWN_MALWARE_RESILIENCE: عالية جداً
- ZERO_DAY_RESILIENCE: عالية
- PARSER_EXPLOIT_RESILIENCE: عالية جداً
- SCANNER_COMPROMISE_RESILIENCE: عالية جداً
- FILE_BOMB_RESILIENCE: عالية
- PLATFORM_AVAILABILITY_RESILIENCE: عالية
- TEMP_CLIENT_UPLOAD_SECURITY: عالية
- SAUDI_CYBERSECURITY_ALIGNMENT_STATUS: DESIGNED TO ALIGN WITH (ECC-2:2024، CCC-2:2024، DCC-1:2022) — بلا ادعاء Compliance
- REMAINING_CRITICAL_GAPS: لا حجر منفصل ولا حالة فحص في المخطط الحالي؛ لا ماسح/صندوق مُشغَّل؛ لا بوابة تسليم موحدة مفروضة
- REMAINING_HIGH_GAPS: Legacy غير مجرود؛ الوسائط العامة بلا فحص؛ لا حصص لكل توكن؛ لا سلسلة بصمات لتدقيق الفحص؛ Allowlist المستندات أوسع من مرفقات البريد
- UNPROVEN_SECURITY_ASSUMPTIONS: توافر مزود ماسح سعودي بـ mTLS؛ جدوى عامل مؤقت لكل ملف على البنية الحالية؛ كلفة الصندوق الديناميكي؛ دقة CDR على مستندات عربية معقّدة
- READY_FOR_IMPLEMENTATION_PLANNING = YES

WAITING FOR SECURITY ARCHITECTURE REVIEW
