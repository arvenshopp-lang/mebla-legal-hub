REVOKE EXECUTE ON FUNCTION public.next_contract_number(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION private.document_requests_enforce_case_org() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.ranking_settings_guard() FROM PUBLIC, anon, authenticated;