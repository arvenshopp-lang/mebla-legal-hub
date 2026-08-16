import urllib.request
import urllib.error

routes = [
    ('/', 'Landing Page'),
    ('/login', 'Login Route'),
    ('/register', 'Register Route'),
    ('/forgot-password', 'Forgot Password'),
    ('/reset-password', 'Reset Password'),
    ('/dashboard', 'Dashboard Route'),
    ('/clients', 'Clients Route'),
    ('/cases', 'Cases Route'),
    ('/documents', 'Documents Route'),
    ('/settings', 'Settings Route'),
    ('/mehla-admin', 'Admin Root Route'),
    ('/mehla-admin/activity', 'Admin Activity Observability'),
    ('/non-existent-page-404', 'Non-existent 404 Route'),
    ('/qa-modcheck', 'Diagnostic Route Check (Expected 404)')
]

print('======================================================================')
print('REAL HTTP RUNTIME SMOKE TESTING (http://localhost:3000)')
print('======================================================================')

for path, label in routes:
    url = f'http://localhost:3000{path}'
    req = urllib.request.Request(url, headers={'User-Agent': 'MEHLA-Runtime-Smoke/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            status = resp.status
            content_type = resp.headers.get('Content-Type', '').split(';')[0]
            body = resp.read()
            length = len(body)
            print(f'{status} OK  | {path:<26} | {label:<28} | Content: {content_type} ({length} bytes)')
    except urllib.error.HTTPError as e:
        print(f'{e.code} ERR | {path:<26} | {label:<28} | HTTP Error {e.code}')
    except Exception as e:
        print(f'FAIL    | {path:<26} | {label:<28} | {e}')

print('======================================================================')
