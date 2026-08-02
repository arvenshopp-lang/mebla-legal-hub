DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
REVOKE ALL ON SCHEMA net FROM anon, authenticated, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated, public;
GRANT USAGE ON SCHEMA net TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres, service_role;