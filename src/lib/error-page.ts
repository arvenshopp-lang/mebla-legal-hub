export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <title>تعذّر عرض الصفحة | مِهلة</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/fonts/mehla-fonts.css" />
    <style>
      :root { --primary:#173F35; --bg:#F7F8F6; --surface:#FFFFFF; --border:#DDE3DF; --text:#15201C; --muted:#5E6B65; }
      * { box-sizing: border-box; }
      body { margin:0; padding:1.5rem; min-height:100dvh; display:grid; place-items:center;
             background:var(--bg); color:var(--text);
             font:15px/1.8 "IBM Plex Sans Arabic", system-ui, sans-serif; }
      .card { width:100%; max-width:30rem; background:var(--surface); border:1px solid var(--border);
              border-radius:12px; padding:2rem; }
      .brand { display:block; height:44px; width:auto; margin:0 0 1.5rem; }
      h1 { font-size:1.25rem; margin:0 0 .5rem; line-height:1.4; }
      p { color:var(--muted); margin:0 0 1.75rem; }
      .actions { display:flex; gap:.5rem; flex-wrap:wrap; }
      a, button { min-height:44px; display:inline-flex; align-items:center; justify-content:center;
                  padding:0 1.25rem; border-radius:8px; font:inherit; font-weight:600; cursor:pointer;
                  text-decoration:none; border:1px solid transparent; }
      .primary { background:var(--primary); color:#fff; }
      .primary:hover { background:#12332B; }
      .secondary { background:var(--surface); color:var(--text); border-color:var(--border); }
      .secondary:hover { background:var(--bg); }
      a:focus-visible, button:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
    </style>
  </head>
  <body>
    <main class="card">
      <img class="brand" src="/favicon.svg" width="150" height="78" alt="مِهلة | MEHLA" />
      <h1>تعذّر عرض هذه الصفحة</h1>
      <p>حدث خطأ غير متوقع أثناء تحميل الصفحة. يمكنك المحاولة مرة أخرى أو العودة إلى الصفحة الرئيسية.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">إعادة المحاولة</button>
        <a class="secondary" href="/">العودة للرئيسية</a>
      </div>
    </main>
  </body>
</html>`;
}
