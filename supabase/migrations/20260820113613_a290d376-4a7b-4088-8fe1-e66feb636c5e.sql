UPDATE public.sms_settings
SET
  signup_mode = 'optional',
  require_phone = false,
  show_phone_field = true,
  health_status = 'disabled',
  updated_at = now()
WHERE id = true;