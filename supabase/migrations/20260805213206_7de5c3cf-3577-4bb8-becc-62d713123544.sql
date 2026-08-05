-- استبدال الصلاحية الموروثة settings.manage في سياسات RLS بالصلاحيات الدقيقة.
DROP POLICY IF EXISTS "key_registry_staff_read" ON public.encryption_key_registry;
CREATE POLICY "key_registry_staff_read" ON public.encryption_key_registry
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'security.read'));

DROP POLICY IF EXISTS "reencryption_jobs_staff_read" ON public.pii_reencryption_jobs;
CREATE POLICY "reencryption_jobs_staff_read" ON public.pii_reencryption_jobs
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'security.read'));

DROP POLICY IF EXISTS "content_pages_staff_insert" ON public.platform_content_pages;
CREATE POLICY "content_pages_staff_insert" ON public.platform_content_pages
  FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'content.manage'));

DROP POLICY IF EXISTS "content_pages_staff_update" ON public.platform_content_pages;
CREATE POLICY "content_pages_staff_update" ON public.platform_content_pages
  FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'content.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'content.manage'));

DROP POLICY IF EXISTS "content_pages_staff_delete" ON public.platform_content_pages;
CREATE POLICY "content_pages_staff_delete" ON public.platform_content_pages
  FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'content.manage'));

DROP POLICY IF EXISTS "platform_feature_flags_staff_read" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags_staff_read" ON public.platform_feature_flags
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'feature_flags.read'));

DROP POLICY IF EXISTS "platform_feature_flags_staff_insert" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags_staff_insert" ON public.platform_feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'feature_flags.manage'));

DROP POLICY IF EXISTS "platform_feature_flags_staff_update" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags_staff_update" ON public.platform_feature_flags
  FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'feature_flags.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'feature_flags.manage'));

DROP POLICY IF EXISTS "platform_feature_flags_staff_delete" ON public.platform_feature_flags;
CREATE POLICY "platform_feature_flags_staff_delete" ON public.platform_feature_flags
  FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'feature_flags.manage'));

DROP POLICY IF EXISTS "platform_notification_rules_staff_read" ON public.platform_notification_rules;
CREATE POLICY "platform_notification_rules_staff_read" ON public.platform_notification_rules
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'notification_rules.read'));

DROP POLICY IF EXISTS "platform_notification_rules_staff_insert" ON public.platform_notification_rules;
CREATE POLICY "platform_notification_rules_staff_insert" ON public.platform_notification_rules
  FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'notification_rules.manage'));

DROP POLICY IF EXISTS "platform_notification_rules_staff_update" ON public.platform_notification_rules;
CREATE POLICY "platform_notification_rules_staff_update" ON public.platform_notification_rules
  FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'notification_rules.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'notification_rules.manage'));

DROP POLICY IF EXISTS "platform_notification_rules_staff_delete" ON public.platform_notification_rules;
CREATE POLICY "platform_notification_rules_staff_delete" ON public.platform_notification_rules
  FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'notification_rules.manage'));

DROP POLICY IF EXISTS "settings managers read" ON public.platform_settings;
CREATE POLICY "settings managers read" ON public.platform_settings
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'platform_settings.read'));

DROP POLICY IF EXISTS "settings managers insert" ON public.platform_settings;
CREATE POLICY "settings managers insert" ON public.platform_settings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'platform_settings.manage'));

DROP POLICY IF EXISTS "settings managers update" ON public.platform_settings;
CREATE POLICY "settings managers update" ON public.platform_settings
  FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'platform_settings.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'platform_settings.manage'));

DROP POLICY IF EXISTS "Platform settings managers read sms logs" ON public.sms_delivery_logs;
CREATE POLICY "sms_delivery_logs_staff_read" ON public.sms_delivery_logs
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sms.read'));

DROP POLICY IF EXISTS "Platform settings managers read sms settings" ON public.sms_settings;
CREATE POLICY "sms_settings_staff_read" ON public.sms_settings
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sms.read'));