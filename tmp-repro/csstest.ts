import { validateCustomCssServer } from "../src/lib/design/css-guard.server";
const cases: [string,string][] = [
  ["h1 { color: red;", "global"],
  ["@import url('https://evil.com/x.css'); h1{color:red}", "global"],
  ["body { display:none }", "global"],
  ["@font-face { font-family: X; src: url('https://cdn.x/f.woff2') }", "global"],
  ["main{padding:16px}\n[data-slot=\"card\"]{border-radius:8px}", "clients"],
  ["@supports (display:grid){ .a{ z-index: 99999 } }", "global"],
];
for (const [css, key] of cases) {
  const r = validateCustomCssServer(css, key);
  console.log(key, "| valid:", r.valid, "| blocked:", r.blocked_rules);
}
