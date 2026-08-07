ALTER TABLE public.webhook_endpoints DROP CONSTRAINT webhook_endpoints_verification_mode;

ALTER TABLE public.webhook_endpoints
  ADD CONSTRAINT webhook_endpoints_verification_mode
  CHECK (verification_mode = ANY (ARRAY['hmac_sha256'::text, 'shared_secret'::text, 'url_token'::text]));