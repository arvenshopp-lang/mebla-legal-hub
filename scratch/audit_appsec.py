import os
import re
import glob

routes_dir = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\src\routes"
lib_dir = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\src\lib"

api_routes = []
public_routes = []
authenticated_routes = []
admin_routes = []

for root, _, files in os.walk(routes_dir):
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, routes_dir)
            with open(full_path, "r", encoding="utf-8", errors="ignore") as file:
                content = file.read()
            
            if "api/public" in rel_path.replace("\\", "/"):
                has_guard = "guardCronRequest" in content or "guard" in content.lower() or "verify" in content.lower()
                public_routes.append({
                    'path': rel_path,
                    'guarded': has_guard,
                    'content_snippet': content[:300]
                })
            elif "api" in rel_path.replace("\\", "/"):
                api_routes.append(rel_path)
            elif "_authenticated" in rel_path.replace("\\", "/"):
                authenticated_routes.append(rel_path)
            elif "admin" in rel_path.replace("\\", "/"):
                admin_routes.append(rel_path)

print(f"Total API Public Routes: {len(public_routes)}")
for pr in public_routes:
    print(f" - {pr['path']} | Guarded/Verified: {pr['guarded']}")

print(f"\nTotal Authenticated Routes: {len(authenticated_routes)}")
print(f"Total Admin Routes: {len(admin_routes)}")

# Check crypto and PII handling
pii_file = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\src\lib\crypto\pii.server.ts"
vault_file = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\src\lib\integrations\vault.server.ts"

print("\n--- CRYPTO AUDIT ---")
if os.path.exists(pii_file):
    with open(pii_file, "r", encoding="utf-8") as f:
        pii_code = f.read()
    has_aes_gcm = "aes-256-gcm" in pii_code.lower()
    has_hmac = "sha256" in pii_code.lower()
    print(f"PII Server Crypto: AES-256-GCM present: {has_aes_gcm}, HMAC Blind Index present: {has_hmac}")

if os.path.exists(vault_file):
    with open(vault_file, "r", encoding="utf-8") as f:
        vault_code = f.read()
    has_vault_gcm = "aes-256-gcm" in vault_code.lower()
    print(f"Vault Server Crypto: AES-256-GCM present: {has_vault_gcm}")
