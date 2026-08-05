DO $$
DECLARE
  granular text[] := ARRAY[
    'platform_settings.read','platform_settings.manage',
    'feature_flags.read','feature_flags.manage',
    'notification_rules.read','notification_rules.manage',
    'integrations.read','integrations.manage','integrations.test','integrations.activate','integrations.view_logs',
    'content.read','content.manage','content.publish','content.rollback',
    'design.read','design.manage',
    'sms.read','sms.manage',
    'security.read','security.manage'
  ];
BEGIN
  UPDATE public.platform_roles
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || granular)),
      updated_at = now()
  WHERE permissions @> ARRAY['settings.manage']::text[];

  UPDATE public.platform_staff
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || granular)),
      updated_at = now()
  WHERE permissions @> ARRAY['settings.manage']::text[];

  UPDATE public.platform_roles
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['seo.read'])),
      updated_at = now()
  WHERE permissions @> ARRAY['seo.manage']::text[];

  UPDATE public.platform_staff
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['seo.read'])),
      updated_at = now()
  WHERE permissions @> ARRAY['seo.manage']::text[];

  UPDATE public.platform_roles
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['backups.read'])),
      updated_at = now()
  WHERE permissions && ARRAY['backups.manage','backups.restore']::text[];

  UPDATE public.platform_staff
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['backups.read'])),
      updated_at = now()
  WHERE permissions && ARRAY['backups.manage','backups.restore']::text[];

  UPDATE public.platform_roles
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['rbac.read'])),
      updated_at = now()
  WHERE permissions @> ARRAY['staff.view']::text[];

  UPDATE public.platform_staff
  SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['rbac.read'])),
      updated_at = now()
  WHERE permissions @> ARRAY['staff.view']::text[];
END $$;