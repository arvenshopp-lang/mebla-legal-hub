import os
import re
import unittest
from urllib.parse import urlparse

TRUSTED_HOST_PATTERN = re.compile(
    r"^(?:(?:[a-z0-9-]+\.)*mehlalex\.com|(?:[a-z0-9-]+\.)*lovable\.(?:app|dev)|localhost(?::\d+)?)$",
    re.IGNORECASE
)
DEFAULT_SITE_ORIGIN = "https://mehlalex.com"

def is_trusted_origin(origin_or_url: str) -> bool:
    if not origin_or_url:
        return False
    try:
        if not (origin_or_url.startswith("http://") or origin_or_url.startswith("https://")):
            origin_or_url = f"https://{origin_or_url}"
        parsed = urlparse(origin_or_url)
        host = parsed.netloc.lower()
        hostname = parsed.hostname.lower() if parsed.hostname else ""
        return bool(TRUSTED_HOST_PATTERN.match(host) or TRUSTED_HOST_PATTERN.match(hostname))
    except Exception:
        return False

def sanitize_site_origin(origin_or_url: str) -> str:
    if not origin_or_url:
        return DEFAULT_SITE_ORIGIN
    try:
        parsed = urlparse(origin_or_url)
        host = parsed.netloc.lower()
        hostname = parsed.hostname.lower() if parsed.hostname else ""
        if TRUSTED_HOST_PATTERN.match(host) or TRUSTED_HOST_PATTERN.match(hostname):
            return f"{parsed.scheme}://{parsed.netloc}"
        return DEFAULT_SITE_ORIGIN
    except Exception:
        return DEFAULT_SITE_ORIGIN

def site_origin(candidate_url: str, path: str = "") -> str:
    clean_path = path if (not path or path.startswith("/")) else f"/{path}"
    origin = sanitize_site_origin(candidate_url)
    return f"{origin}{clean_path}"

def assurance_level(claims: dict | None) -> str:
    if not claims:
        return "unknown"
    aal = claims.get("aal")
    if aal == "aal2":
        return "aal2"
    amr = claims.get("amr")
    if isinstance(amr, list):
        if any(isinstance(e, dict) and e.get("method") in ("totp", "mfa/totp") for e in amr):
            return "aal2"
    if aal == "aal1":
        return "aal1"
    return "unknown"

class TestP0SecurityHardening(unittest.TestCase):
    def test_trusted_origins(self):
        self.assertTrue(is_trusted_origin("https://mehlalex.com"))
        self.assertTrue(is_trusted_origin("https://app.mehlalex.com"))
        self.assertTrue(is_trusted_origin("https://notify.mehlalex.com"))
        self.assertTrue(is_trusted_origin("https://preview--branch.lovable.app"))
        self.assertTrue(is_trusted_origin("https://branch.lovable.dev"))
        self.assertTrue(is_trusted_origin("http://localhost:3000"))
        self.assertTrue(is_trusted_origin("http://localhost:8080"))

    def test_untrusted_origins_rejection(self):
        self.assertFalse(is_trusted_origin("https://evil.com"))
        self.assertFalse(is_trusted_origin("https://attacker.mehlalex.com.attacker.com"))
        self.assertFalse(is_trusted_origin("https://lovable.app.evil.com"))
        self.assertFalse(is_trusted_origin("javascript:alert(1)"))
        self.assertFalse(is_trusted_origin(""))

    def test_site_origin_sanitization_and_fallback(self):
        # Malicious Host header fallback to default production origin
        self.assertEqual(site_origin("https://evil-phishing.com/reset", "/reset-password"), "https://mehlalex.com/reset-password")
        self.assertEqual(site_origin("https://attacker.com", "auth/callback"), "https://mehlalex.com/auth/callback")
        # Legitimate origins preserved
        self.assertEqual(site_origin("https://mehlalex.com/some/path", "/reset-password"), "https://mehlalex.com/reset-password")
        self.assertEqual(site_origin("https://branch.lovable.app", "/reset-password"), "https://branch.lovable.app/reset-password")
        self.assertEqual(site_origin("", "/reset-password"), "https://mehlalex.com/reset-password")

    def test_assurance_level_checks(self):
        # AAL1
        self.assertEqual(assurance_level({"aal": "aal1", "sub": "u-1"}), "aal1")
        # AAL2 direct
        self.assertEqual(assurance_level({"aal": "aal2", "sub": "u-1"}), "aal2")
        # AAL2 via AMR TOTP
        self.assertEqual(assurance_level({"aal": "aal1", "amr": [{"method": "password"}, {"method": "totp"}]}), "aal2")
        # Unknown / None
        self.assertEqual(assurance_level(None), "unknown")
        self.assertEqual(assurance_level({}), "unknown")

    def test_qa_modcheck_removed(self):
        repo_root = r"c:\Users\x4iii\Documents\antigravity\radiant-bell"
        qa_path = os.path.join(repo_root, "src", "routes", "api", "public", "qa-modcheck.ts")
        self.assertFalse(os.path.exists(qa_path), "qa-modcheck.ts must not exist on disk")

    def test_source_code_guards(self):
        repo_root = r"c:\Users\x4iii\Documents\antigravity\radiant-bell"
        admin_guard_path = os.path.join(repo_root, "src", "lib", "admin-guard.server.ts")
        pii_path = os.path.join(repo_root, "src", "lib", "pii.server.ts")
        sensitive_guard_path = os.path.join(repo_root, "src", "lib", "security", "sensitive-guard.server.ts")

        with open(admin_guard_path, "r", encoding="utf-8") as f:
            admin_guard_src = f.read()
        with open(pii_path, "r", encoding="utf-8") as f:
            pii_src = f.read()
        with open(sensitive_guard_path, "r", encoding="utf-8") as f:
            sensitive_guard_src = f.read()

        # Check AAL2 enforcement in requireStaff
        self.assertIn("aal !== \"aal2\"", admin_guard_src)
        self.assertIn("TRUSTED_HOST_PATTERN", admin_guard_src)
        self.assertIn("sanitizeSiteOrigin", admin_guard_src)

        # Check AAL2 in pii.server.ts
        self.assertIn("aal !== \"aal2\"", pii_src)

        # Check AAL2 in sensitive-guard.server.ts
        self.assertIn("operation === \"pii_reveal\" && aal !== \"aal2\"", sensitive_guard_src)

if __name__ == "__main__":
    unittest.main()
