-- توحيد سياسة حذف المستندات: لا مسار REST مباشر يزيل الصف دون الكائن.
-- الحذف يجري فقط داخل دالة خادمية مصرّح لها بمفتاح الخدمة (تزيل الكائن ثم الصف).
DROP POLICY IF EXISTS docs_delete ON public.documents;
REVOKE DELETE ON public.documents FROM authenticated;

-- ولا حذف مباشر للكائنات من المتصفح كذلك (مفتاح الخدمة يتجاوز RLS).
DROP POLICY IF EXISTS docs_storage_delete ON storage.objects;

GRANT ALL ON public.documents TO service_role;