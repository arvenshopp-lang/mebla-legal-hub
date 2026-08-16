import { describe, it, expect } from "bun:test";
import { isTrustedOrigin, sanitizeSiteOrigin, siteOrigin } from "../src/lib/admin-guard.server";
import { assuranceLevel, hasAal2 } from "../src/lib/security/sensitive-guard.server";
import * as fs from "fs";
import * as path from "path";

describe("P0 Hardening — Trusted Origin (siteOrigin)", () => {
  it("validates trusted production and staging origins", () => {
    expect(isTrustedOrigin("https://mehlalex.com")).toBe(true);
    expect(isTrustedOrigin("https://app.mehlalex.com")).toBe(true);
    expect(isTrustedOrigin("https://preview--branch.lovable.app")).toBe(true);
    expect(isTrustedOrigin("http://localhost:3000")).toBe(true);
    expect(isTrustedOrigin("http://localhost:8080")).toBe(true);
  });

  it("rejects untrusted / malicious host origins (Host Header Injection defense)", () => {
    expect(isTrustedOrigin("https://evil.com")).toBe(false);
    expect(isTrustedOrigin("https://attacker.mehlalex.com.attacker.com")).toBe(false);
    expect(isTrustedOrigin("https://lovable.app.evil.com")).toBe(false);
    expect(isTrustedOrigin("javascript:alert(1)")).toBe(false);
  });

  it("sanitizes untrusted URLs by falling back to default production origin", () => {
    expect(sanitizeSiteOrigin("https://evil-phishing.com/steal-token")).toBe("https://mehlalex.com");
    expect(sanitizeSiteOrigin("https://mehlalex.com/some/path")).toBe("https://mehlalex.com");
    expect(sanitizeSiteOrigin("")).toBe("https://mehlalex.com");
  });
});

describe("P0 Hardening — AAL2 / MFA Assurance Level Parsing", () => {
  it("identifies AAL1 correctly from claims", () => {
    const claims = { aal: "aal1", sub: "user-123" };
    expect(assuranceLevel(claims)).toBe("aal1");
    expect(hasAal2(claims)).toBe(false);
  });

  it("identifies AAL2 correctly from claims with aal property", () => {
    const claims = { aal: "aal2", sub: "user-123" };
    expect(assuranceLevel(claims)).toBe("aal2");
    expect(hasAal2(claims)).toBe(true);
  });

  it("identifies AAL2 from amr array containing totp", () => {
    const claims = {
      aal: "aal1",
      amr: [{ method: "password" }, { method: "totp" }],
      sub: "user-123",
    };
    expect(assuranceLevel(claims)).toBe("aal2");
    expect(hasAal2(claims)).toBe(true);
  });

  it("returns unknown for missing or invalid claims", () => {
    expect(assuranceLevel(null)).toBe("unknown");
    expect(assuranceLevel(undefined)).toBe("unknown");
    expect(hasAal2(null)).toBe(false);
  });
});

describe("P0 Hardening — QA Diagnostic Route Cleanup", () => {
  it("confirms qa-modcheck.ts is completely removed from source tree", () => {
    const qaPath = path.join(process.cwd(), "src", "routes", "api", "public", "qa-modcheck.ts");
    expect(fs.existsSync(qaPath)).toBe(false);
  });
});
