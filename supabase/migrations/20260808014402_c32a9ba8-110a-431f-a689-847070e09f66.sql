UPDATE public.platform_payment_provider_configs
SET connection_status = 'not_configured',
    is_enabled = false,
    last_test_error = 'لم تُحفظ مفاتيح المزوّد بعد.',
    settings = (settings - 'secret_reference'),
    updated_at = now()
WHERE code = 'moyasar'
  AND connection_status <> 'verified';