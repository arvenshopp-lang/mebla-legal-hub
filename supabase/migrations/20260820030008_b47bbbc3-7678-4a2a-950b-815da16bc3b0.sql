DELETE FROM public.platform_staff
WHERE email ILIKE '%@mehlaqa.test'
   OR email ILIKE '%@mehla-qa.test';