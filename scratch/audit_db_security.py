import os
import re
import glob

migrations_dir = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\supabase\migrations"
migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

print(f"Total migration files found: {len(migration_files)}")

tables = {} # table_name: {'rls': False, 'policies': [], 'file': ''}
security_definer_functions = []
storage_policies = []
public_grants = []

for mf in migration_files:
    fname = os.path.basename(mf)
    with open(mf, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    
    # 1. Find Tables
    for m in re.finditer(r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_\.\"]+)", content, re.IGNORECASE):
        tname = m.group(1).replace('"', '').lower()
        if tname not in tables:
            tables[tname] = {'rls': False, 'policies': [], 'file': fname, 'has_org_id': False}
    
    # 2. Check RLS enable
    for m in re.finditer(r"ALTER\s+TABLE\s+(?:ONLY\s+)?([a-zA-Z0-9_\.\"]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", content, re.IGNORECASE):
        tname = m.group(1).replace('"', '').lower()
        if tname in tables:
            tables[tname]['rls'] = True
        else:
            tables[tname] = {'rls': True, 'policies': [], 'file': fname, 'has_org_id': False}
            
    # 3. Check Policies
    for m in re.finditer(r"CREATE\s+POLICY\s+([\"a-zA-Z0-9_\s]+)\s+ON\s+([a-zA-Z0-9_\.\"]+)([\s\S]*?)(?:ALTER\s+|CREATE\s+|COMMENT\s+|REVOKE\s+|GRANT\s+|;\s*$)", content, re.IGNORECASE):
        pname = m.group(1).strip()
        tname = m.group(2).replace('"', '').lower()
        body = m.group(3)
        if tname in tables:
            tables[tname]['policies'].append((pname, fname))
        if "storage.objects" in tname:
            storage_policies.append((pname, fname, body[:150]))
            
    # 4. Check SECURITY DEFINER functions
    for m in re.finditer(r"CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z0-9_\.\"]+)\s*\(([\s\S]*?)\)[\s\S]*?SECURITY\s+DEFINER([\s\S]*?)(?:LANGUAGE|AS|\$\$)", content, re.IGNORECASE):
        fn_name = m.group(1)
        args = m.group(2)
        body = m.group(3)
        has_search_path = "search_path" in body.lower() or "search_path" in content[m.start():m.end()+200].lower()
        security_definer_functions.append({
            'name': fn_name,
            'file': fname,
            'search_path': has_search_path
        })

print("\n--- TABLES SUMMARY ---")
tables_without_rls = [t for t, info in tables.items() if not info['rls'] and not t.startswith('ops.') and not t.startswith('extensions.') and not t.startswith('cron.') and not t.startswith('net.')]
print(f"Total tables tracked: {len(tables)}")
print(f"Tables without explicit ENABLE RLS: {len(tables_without_rls)}")
for t in tables_without_rls:
    print(f"  - {t} (defined in {tables[t]['file']})")

print(f"\nTotal SECURITY DEFINER functions: {len(security_definer_functions)}")
functions_without_search_path = [fn for fn in security_definer_functions if not fn['search_path']]
print(f"SECURITY DEFINER functions missing search_path: {len(functions_without_search_path)}")
for fn in functions_without_search_path[:10]:
    print(f"  - {fn['name']} in {fn['file']}")

print(f"\nTotal Storage policies found: {len(storage_policies)}")
for sp in storage_policies[:5]:
    print(f"  - {sp[0]} on storage.objects in {sp[1]}")
