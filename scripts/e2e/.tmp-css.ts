import { validateCustomCssServer } from "@/lib/design/css-guard.server";
const cases: Array<[string, string]> = [
  ["import", "@import url('https://evil.example/x.css');\n.a{color:red}"],
  ["external url", ".hero{\n  background:url('https://cdn.evil.com/a.png');\n}"],
  ["hide logout", "[data-app-header] .logout,\n.signout{display:none !important}"],
  ["syntax error", ".a{color:red;\n.b{color:blue}"],
  ["iframe", "iframe{opacity:0}"],
  ["huge z-index", ".x{position:fixed;inset:0;z-index:2147483647}"],
  ["valid", ":root{--x:#123C32}\n.card{border-radius:12px;color:var(--x)}"],
];
for (const [name, css] of cases) {
  const r: any = await (validateCustomCssServer as any)(css, "home");
  const issues = (r.errors ?? r.issues ?? []).map((e: any) =>
    typeof e === "string" ? e : `${e.message ?? e.reason}${e.line ? ` (سطر ${e.line}${e.column ? `:${e.column}` : ""})` : ""}`,
  );
  console.log(`${name}: valid=${r.valid} | ${issues.slice(0, 3).join(" ⟂ ")}`);
}
