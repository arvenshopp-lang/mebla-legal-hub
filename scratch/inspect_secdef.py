import os
import re
import glob

migrations_dir = r"c:\Users\x4iii\Documents\antigravity\radiant-bell\supabase\migrations"
migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

secdef_funcs = []

for mf in migration_files:
    fname = os.path.basename(mf)
    with open(mf, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()

    # Find functions with SECURITY DEFINER
    for m in re.finditer(r"CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+([a-zA-Z0-9_\.\"]+)\s*\(([\s\S]*?)\)[\s\S]*?SECURITY\s+DEFINER([\s\S]*?)(?:LANGUAGE|AS|\$\$)", content, re.IGNORECASE):
        fn_name = m.group(1).replace('"', '')
        args = m.group(2)
        clause = m.group(3)
        
        full_block = content[m.start():m.start()+1500]
        has_search_path = "search_path" in clause.lower() or "search_path" in full_block.lower()
        
        # Check revokes and grants
        has_revoke_public = f"REVOKE ALL ON FUNCTION {fn_name}" in content or f"REVOKE EXECUTE ON FUNCTION {fn_name}" in content or "REVOKE ALL" in content
        
        secdef_funcs.append({
            'name': fn_name,
            'file': fname,
            'has_search_path': has_search_path,
            'schema': fn_name.split('.')[0] if '.' in fn_name else 'public'
        })

print(f"Total SECURITY DEFINER functions detected: {len(secdef_funcs)}")
missing_sp = [f for f in secdef_funcs if not f['has_search_path']]
print(f"Functions missing search_path: {len(missing_sp)}")

schema_counts = {}
for f in secdef_funcs:
    s = f['schema']
    schema_counts[s] = schema_counts.get(s, 0) + 1

print("By schema:", schema_counts)
