UPDATE public.platform_plans SET esignature_enabled = true WHERE code IN ('professional', 'enterprise');
UPDATE public.platform_plans SET esignature_enabled = false WHERE code IN ('free', 'basic');
UPDATE public.platform_plans SET max_clients = 200 WHERE code = 'basic';
UPDATE public.platform_plans SET max_clients = 2000 WHERE code = 'professional';
UPDATE public.platform_plans SET max_clients = NULL WHERE code = 'enterprise';