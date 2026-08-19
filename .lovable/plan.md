# MEHLA FILE SECURITY HARDENING PLAN

تقرير تدقيق ومعمارية فقط — بلا تنفيذ. كل ما يلي مستخرج من الكود وقاعدة البيانات الفعلية.

## CURRENT STATE

مسار الرفع الحالي (مساحة عمل المكتب وبوابة العميل معاً):
```text
المتصفح → دالة خادمية تُصدر Signed Upload URL (مجلد المكتب فقط)
        → رفع البايتات مباشرة إلى bucket "documents" (نفس المخزن النهائي)
        → الخادم ينزّل البايتات ويتحقق (حجم + امتداد + MIME معياري + Magic Bytes)
        → عند النجاح: صف في documents بحالة file_status = AVAILABLE
        → عند الفشل: حذف الكائن اليتيم فوراً
```
العرض/التنزيل: عبر `src/lib/secure-view/*` بروابط موقّعة عمرها 60 ثانية مع ختم علامة مائية خادمي.

حقائق مثبتة:
- المخازن الأربعة كلها Private: `documents`, `email-attachments`, `office-media-draft`, `office-public-media`.
- سياسات `storage.objects` تمنع أدوار المتصفح (anon/authenticated) من مخزن المستندات كلياً — الوصول خادمي فقط.
- `documents` bucket: حد 20MB + قائمة MIME على مستوى المخزن أوسع من قائمة التطبيق (تسمح doc/xls/ppt/heic بينما التطبيق يقبل pdf/docx/صور/txt/csv).
- جدول `documents` لا يحتوي أي حقل أمني للفحص: لا `sha256`، لا `scan_status`، لا `detected_mime`. الموجود فقط `file_status` بقيم AVAILABLE / UNCHECKED / FILE_MISSING / INVALID_FILE (حالياً 40 AVAILABLE و2 UNCHECKED).
- `email_attachments` أكثر تقدماً: فيه `sha256` و`scan_status` و`is_quarantined`، لكن القيمة المكتوبة فعلياً هي `not_scanned` مع تعليق صريح بعدم وجود موصل فحص فيروسات.

### الإجابات المباشرة
| سؤال | الواقع |
|---|---|
| أين يذهب الملف فور رفعه؟ | نفس المخزن النهائي `documents` داخل مجلد المكتب |
| هل يصبح متاحاً مباشرة؟ | لا يُعرض قبل ربط الصف، لكن الكائن موجود في المخزن النهائي قبل التحقق |
| Storage Private؟ | نعم، الأربعة |
| Signed URLs؟ | نعم (60 ثانية للعرض، قصيرة للمرفقات) |
| وصول قبل التحقق الأمني؟ | لا وصول من المتصفح (السياسات تمنع)، لكن نافذة وجود فعلية في المخزن النهائي |
| Antivirus / Malware Scanner حقيقي؟ | لا يوجد |
| Magic Bytes؟ | نعم، فعلي وقوي (`file-signature.ts`) |
| MIME sniffing؟ | جزئي: تطبيع من الامتداد + مطابقة البصمة، بلا كشف MIME مستقل |
| Archive inspection؟ | لا (الأرشيفات غير مسموحة أصلاً؛ يوجد قراءة فهرس ZIP لأجل docx فقط) |
| PDF structural inspection؟ | لا (فحص ترويسة %PDF- فقط) |
| Office macro detection؟ | لا (يُشترط وجود word/document.xml فقط؛ لا كشف VBA/OLE) |
| YARA؟ | لا |
| SHA-256؟ | للمرفقات البريدية فقط، وليس لمستندات القضايا |
| Quarantine؟ | للبريد الوارد فقط؛ لا حجر لمستندات القضايا |
| Audit Log لعملية الفحص؟ | لا. يوجد تدقيق عام (activity_logs, document_request_events) بلا أحداث فحص |
| فشل Scanner / Timeout / Retry؟ | غير قابل للتطبيق — لا يوجد Scanner |
| مسار يتجاوز الفحص؟ | لا يوجد مسار يتجاوز فحص البصمة الحالي، لكن `UNCHECKED` و`repair.server.ts` يعالجان سجلات قديمة بلا فحص محتوى كامل |

## EXISTING PROTECTIONS
مخازن خاصة + منع أدوار المتصفح، روابط موقّعة قصيرة، فحص Magic Bytes خادمي، رفض HTML/JSON المتنكر، تطبيع MIME من الامتداد، مسارات UUID، منع Path Traversal (`assertOwnedPath`)، فهرس فريد يمنع إعادة استخدام المسار، حدود حجم/عدد ملفات، Rate Limit لروابط العملاء، عزل مكاتب صارم، حذف الكائن اليتيم، تشفير وعلامة مائية في العرض.

## EXISTING GAPS
لا Antivirus، لا YARA، لا فحص بنيوي لـ PDF، لا كشف ماكرو Office، لا SHA-256 لمستندات القضايا، لا Quarantine منفصل، لا State Machine للفحص، لا أحداث تدقيق للفحص، لا سياسة Fail-Closed، قائمة MIME في المخزن أوسع من التطبيق، بوابة العرض/التنزيل تعتمد على `file_status` لا على `scan_status`.

## CRITICAL RISKS
1. مستند PDF أو docx يحمل حمولة خبيثة يُخزَّن ويُسلَّم للمحامي أو للعميل بلا أي فحص محتوى (خطورة عالية).
2. غياب Quarantine: نافذة زمنية يوجد فيها الكائن غير المتحقق في المخزن النهائي.
3. عدم وجود SHA-256 لمستندات القضايا يعيق أي تحقيق حادث أو إثبات سلامة.
4. اتساع قائمة MIME على مستوى المخزن يمنح مساحة قبول أكبر من نية التطبيق.

## RECOMMENDED ARCHITECTURE
```text
UPLOAD (signed URL) → bucket "documents-quarantine" (خاص، خادمي فقط)
  → سجل file_security_scans: pending → scanning
  → Layer 1: حجم + امتداد + MIME + Magic Bytes (موجود)
  → Layer 2: SHA-256 + بحث تكرار (نفس البصمة = نفس القرار)
  → Layer 3: تحليل بنيوي داخلي (PDF: JS/Launch/EmbeddedFile/Encrypt، OOXML: vbaProject/oleObject/external refs)
  → Layer 4: Antivirus خارجي خاص (ClamAV) + YARA
  → قرار:
      clean       → نقل إلى "documents" + release + ربط الصف
      suspicious  → يبقى محجوراً + مراجعة إدارية
      malicious   → block + حدث أمني، لا Release ولا Preview
      unscannable/scan_failed → يبقى محجوراً (FAIL CLOSED)
```

## DATABASE CHANGES REQUIRED (تصميم فقط)
- جدول جديد `file_security_scans`: `id, organization_id, document_id, storage_object_key, quarantine_key, original_filename, declared_mime, detected_mime, extension, file_size, sha256, scan_status, scanner_engine, scanner_version, signature_name, yara_matches jsonb, structural_findings jsonb, risk_score, quarantine_reason, scan_started_at, scan_completed_at, released_at, blocked_at, scan_attempts, last_scan_error, uploaded_by`.
- `documents`: إضافة `sha256`, `scan_id`, `scan_status` (افتراضي `pending`)، مع Backfill للسجلات الحالية إلى `legacy_unscanned` وليس `clean`.
- `email_attachments`: توحيدها على نفس State Machine.
- RLS: قراءة سجلات الفحص داخل المكتب فقط؛ الكتابة خادمية فقط؛ سجل أحداث الفحص Append-only بلا UPDATE/DELETE.
- GRANT صريح لكل جدول جديد.

## STORAGE CHANGES REQUIRED
مخزن `documents-quarantine` خاص، سياسات تمنع anon/authenticated كلياً، بلا أي Public URL أو Signed URL للعرض، تضييق قائمة MIME في `documents` لتطابق التطبيق، وسياسة تنظيف للمحجور المنتهي.

## BACKEND CHANGES REQUIRED
`createUploadSlot` يوجّه إلى مخزن الحجر، خط أنابيب `src/lib/documents/security/*` (hash, pdf-inspect, ooxml-inspect, scanner-client, decision, release)، بوابة موحدة `assertReleasedForDelivery` تُستدعى قبل أي Signed URL أو عرض أو ختم، Retry بـ Exponential Backoff (3 محاولات) ثم `scan_failed`، ونقطة إعادة فحص إدارية.

## FRONTEND CHANGES REQUIRED
حالة «جارٍ التحقق من الملف» مع Polling، تعطيل العرض/التنزيل لأي حالة غير `clean`، شارات عربية للحالات، رسالة رفض عامة («تم رفض الملف لعدم اجتيازه فحص الأمان») بلا تفاصيل داخلية، وقسم إداري «أمن الملفات» بإحصاءات الفحص وصحة الماسح.

## SCANNER OPTIONS
- **WHAT CAN RUN INSIDE CURRENT LOVABLE ARCHITECTURE**: التحقق البنيوي بالكامل بـ TypeScript نقي (Magic Bytes، SHA-256 عبر WebCrypto، تحليل كائنات PDF، فحص أجزاء OOXML/VBA، حدود الأرشيف)، وقواعد شبيهة بـ YARA مبنية على أنماط بايتات.
- **WHAT REQUIRES AN EXTERNAL SERVICE**: ClamAV ومحرك YARA الحقيقي — بيئة التشغيل Worker بلا عمليات فرعية ولا ملفات تنفيذية.
- **SAUDI-HOSTED ARCHITECTURE OPTION**: خدمة `scanner.internal` على بنية مِهلة السعودية (ClamAV + YARA + Unarchiver في حاوية)، Authentication إلزامي (HMAC + mTLS)، غير مكشوفة للعامة، بلا تسجيل محتوى، وترحيل تدريجي: التحليل البنيوي أولاً داخلياً، ثم تفعيل الماسح عند جهوزيته.
- الأرشيفات: تبقى مرفوضة في المرحلة الأولى. عند السماح مستقبلاً: MAX_ARCHIVE_DEPTH=2، MAX_FILE_COUNT=200، MAX_EXTRACTED_SIZE=200MB، نسبة ضغط ≤100:1، ورفض التنفيذيات وZip Slip.

## PRIVACY IMPACT
لا يُرسل أي محتوى مستند إلى VirusTotal أو أي خدمة عامة. الماسح الخارجي داخل بنية نتحكم بها فقط، مع اتفاقية عدم تسجيل محتوى، وبحث السمعة — إن استُخدم — يكون Hash Lookup Only وبموافقة صريحة.

## PERFORMANCE IMPACT
+0.3–1.5 ثانية للتحليل البنيوي، +1–4 ثوانٍ للماسح الخارجي. لذلك يصبح الرفع غير متزامن مع Polling، ويبقى العرض والتنزيل بلا تغيير في السرعة.

## ESTIMATED IMPLEMENTATION COMPLEXITY
| مرحلة | المحتوى | التعقيد |
|---|---|---|
| S1 | Schema + مخزن الحجر + State Machine + SHA-256 | متوسط |
| S2 | تحليل PDF/OOXML داخلي + بوابة التسليم | متوسط-عالي |
| S3 | موصل الماسح الخارجي + Retry + Fail-Closed | عالي (يعتمد على البنية السعودية) |
| S4 | لوحة أمن الملفات + التدقيق | متوسط |
| S5 | CDR (متقدم/مستقبلي) | عالي — مؤجل |

## TEST PLAN
PDF/DOCX/XLSX سليمة، أسماء عربية وطويلة وUnicode، امتداد خاطئ، MIME مزيّف، PDF تالف، PDF فيه JavaScript، مستند ماكرو، أرشيف فيه تنفيذي، ZIP متداخل، محاكاة Zip Bomb آمنة، أرشيف بكلمة مرور، ملف EICAR فقط (لا برمجيات خبيثة حقيقية)، ملف مكرر، ملف صفري، ملف ضخم، محارف خاصة، وصول عبر مكتب آخر، محاولة رابط مباشر، الماسح متوقف، Timeout، Retry، ونتائج clean/suspicious/malicious.

## ROLLBACK PLAN
كل تغيير Additive وغير مدمّر: أعمدة جديدة قابلة للـ Null، مخزن حجر منفصل بلا مساس بالمخزن الحالي، ومفتاح تشغيل `FILE_SCAN_ENFORCEMENT` بقيم off/shadow/enforce للرجوع فوراً إلى المسار الحالي مع الاحتفاظ بسجلات الفحص.

## DEPLOYMENT ORDER
S1 → Backfill (`legacy_unscanned`) → S2 بوضع shadow → مراجعة النتائج → enforce → S3 عند جهوزية الماسح → S4 → S5 لاحقاً.

## ACCEPTANCE CRITERIA
UNSCANNED_FILES_ACCESSIBLE = 0 · MALICIOUS_FILES_RELEASED = 0 · CROSS_TENANT_FILE_ACCESS = 0 · PUBLIC_QUARANTINE_URLS = 0 · CLIENT_SIDE_ONLY_VALIDATION = 0 · FAIL_OPEN_PATHS = 0 · FILES_WITHOUT_SCAN_STATUS = 0 · DOWNLOAD_WITHOUT_AUTHORIZATION = 0 · نجاح جميع اختبارات الأمان.

## الخلاصة
- CURRENT_SECURITY_LEVEL: **MODERATE** (تحقق بنيوي قوي وعزل ممتاز، بلا أي فحص برمجيات خبيثة)
- TARGET_SECURITY_LEVEL: **HIGH / ENTERPRISE LEGAL-GRADE**
- RECOMMENDED_IMPLEMENTATION: S1 + S2 داخل مِهلة أولاً (قيمة أمنية فورية بلا اعتماد خارجي)، ثم S3 مع ماسح خاص سعودي
- EXTERNAL_SERVICE_REQUIRED = YES (لـ S3 فقط: ClamAV + YARA)
- PRODUCTION_CHANGE_REQUIRED = YES (Schema + مخزن جديد، كلها Additive)

WAITING_FOR_APPROVAL
