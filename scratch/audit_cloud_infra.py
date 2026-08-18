import os
import json
import re

package_json_path = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\package.json"
github_workflow_path = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\.github\workflows\security.yml"
gitignore_path = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\.gitignore"
env_example_path = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\.env.example"

print("--- CLOUD INFRA & SUPPLY CHAIN AUDIT ---")

# 1. Package.json inspection
if os.path.exists(package_json_path):
    with open(package_json_path, "r", encoding="utf-8") as f:
        pkg = json.load(f)
    deps = pkg.get("dependencies", {})
    dev_deps = pkg.get("devDependencies", {})
    print(f"Total production dependencies: {len(deps)}")
    print(f"Total dev dependencies: {len(dev_deps)}")
    
    # Check key dependencies
    print(f" - @supabase/supabase-js: {deps.get('@supabase/supabase-js')}")
    print(f" - react: {deps.get('react')}")
    print(f" - @tanstack/react-router: {deps.get('@tanstack/react-router')}")
    print(f" - zod: {deps.get('zod')}")
    print(f" - lucide-react: {deps.get('lucide-react')}")

# 2. CI/CD Workflows
if os.path.exists(github_workflow_path):
    with open(github_workflow_path, "r", encoding="utf-8") as f:
        workflow_content = f.read()
    print("\n--- GITHUB SECURITY WORKFLOW ---")
    print(f"Workflow size: {len(workflow_content)} bytes")
    has_audit = "audit" in workflow_content.lower()
    has_trivy = "trivy" in workflow_content.lower()
    has_semgrep = "semgrep" in workflow_content.lower()
    has_secret_scan = "secret" in workflow_content.lower()
    print(f"Includes npm audit / trivy / semgrep / secret scan: audit={has_audit}, trivy={has_trivy}, semgrep={has_semgrep}, secrets={has_secret_scan}")
    print("Workflow preview:\n", workflow_content[:500])

# 3. Gitignore & Env example
if os.path.exists(gitignore_path):
    with open(gitignore_path, "r", encoding="utf-8") as f:
        gi = f.read()
    print("\n--- GITIGNORE SECRETS PROTECTION ---")
    print(f".env ignored: {'.env' in gi}")
    print(f"node_modules ignored: {'node_modules' in gi}")
    print(f".lovable ignored: {'.lovable' in gi}")

# 4. Secret Scan in Client Code (src/)
print("\n--- CLIENT BUNDLE SECRET EXPOSURE SCAN ---")
client_secret_leaks = []
for root, _, files in os.walk(r"c:\Users\x4iii\Documents\antigravity\radiant-bell\src"):
    for f in files:
        if f.endswith(".ts") or f.endswith(".tsx"):
            fpath = os.path.join(root, f)
            with open(fpath, "r", encoding="utf-8", errors="ignore") as code_file:
                c = code_file.read()
            # check for hardcoded secrets
            if "sbp_" in c:
                client_secret_leaks.append((f, "sbp_ Supabase Management token"))
            if "service_role" in c and "process.env" not in c and not f.endswith(".server.ts"):
                # check if raw string
                if re.search(r"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+", c):
                    client_secret_leaks.append((f, "Hardcoded JWT / Service Role"))
            if "re_" in c and re.search(r"re_[a-zA-Z0-9_]{20,}", c):
                client_secret_leaks.append((f, "Resend API Key"))

print(f"Potential hardcoded client secrets found: {len(client_secret_leaks)}")
for leak in client_secret_leaks:
    print(f"  - {leak[0]}: {leak[1]}")
