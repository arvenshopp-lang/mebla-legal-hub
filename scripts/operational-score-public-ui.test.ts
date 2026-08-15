/**
 * اختبارات مستهدفة لربط قسم «الأكثر إنجازاً» بالصفحة التسويقية.
 * التشغيل: bun run score:public-ui:test
 */

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TopOffices } from "../src/components/marketing/top-offices";
import {
  PUBLIC_RANKING_DISCLAIMER,
  PUBLIC_SECTION_TITLE,
  type PublicOperationalRanking,
  type PublicOperationalRankingItem,
} from "../src/lib/operational-score/score.shared";

let pass = 0;
const failures: string[] = [];
function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}`);
  } else {
    failures.push(`${name}${detail ? ` :: ${detail}` : ""}`);
    console.log(`FAIL — ${name} ${detail}`);
  }
}

const render = (ranking: PublicOperationalRanking) =>
  renderToStaticMarkup(createElement(TopOffices, { ranking }));

const office = (rank: number, extra: Partial<PublicOperationalRankingItem> = {}) =>
  ({
    rank,
    publicName: `مكتب رقم ${rank}`,
    score: 80 + rank,
    badge: null,
    logoUrl: null,
    ...extra,
  }) as PublicOperationalRankingItem;

// 1 — الميزة معطّلة (الحالة الحالية في الإنتاج)
check("feature disabled + items=[] ⇒ لا يُعرض القسم", render({ enabled: false, computedAt: null, items: [] }) === "");

// 2 — الميزة مفعّلة لكن لا نتائج
check("feature enabled + items=[] ⇒ لا يُعرض القسم", render({ enabled: true, computedAt: new Date().toISOString(), items: [] }) === "");

// 2b — معطّلة مع نتائج (Fail closed على مستوى العلم)
check("feature disabled + items ⇒ لا يُعرض القسم", render({ enabled: false, computedAt: null, items: [office(1)] }) === "");

// 3 — مكتب واحد صالح
const one = render({ enabled: true, computedAt: "2026-08-15T00:00:00.000Z", items: [office(1)] });
check("مكتب واحد صالح ⇒ يُعرض", one.includes("مكتب رقم 1") && one.includes(PUBLIC_SECTION_TITLE));
check("العنوان دلالي h2", one.includes("<h2"));

// 4 — أكثر من 5 نتائج ⇒ 5 كحد أقصى
const many = render({
  enabled: true,
  computedAt: "2026-08-15T00:00:00.000Z",
  items: [1, 2, 3, 4, 5, 6, 7].map((r) => office(r)),
});
check("6+ نتائج ⇒ 5 فقط", (many.match(/<li/g) ?? []).length === 5 && !many.includes("مكتب رقم 6"));

// 5 — شعار مفقود ⇒ بديل آمن بلا صورة مكسورة
check("شعار مفقود ⇒ بديل آمن", !one.includes("<img"));
const withLogo = render({
  enabled: true,
  computedAt: null,
  items: [office(1, { logoUrl: "https://cdn.example.com/logo.png" })],
});
check("شعار موجود ⇒ صورة بأبعاد ثابتة و alt", withLogo.includes("<img") && withLogo.includes('alt=""'));

// 6/7/8/9 — الحقول العامة فقط ولا تسريب
const leaky = render({
  enabled: true,
  computedAt: "2026-08-15T00:00:00.000Z",
  items: [
    {
      ...office(1, { badge: "شريك" }),
      // حقول لا تنتمي للعقد العام — يجب ألا تُعرض إطلاقاً
      organizationId: "11111111-1111-1111-1111-111111111111",
      reasonCodes: ["BASE_ELIGIBILITY_NOT_MET"],
      integrity: { status: "pass", activeDays: 41 },
      subscriptionStatus: "active",
      publicOptIn: true,
    } as unknown as PublicOperationalRankingItem,
  ],
});
check("لا تسريب معرّف المكتب", !leaky.includes("11111111-1111-1111-1111-111111111111"));
check("لا تسريب reasonCodes", !leaky.toLowerCase().includes("base_eligibility"));
check("لا تسريب بيانات النزاهة", !leaky.includes("activeDays") && !leaky.includes("integrity") && !/\b41\b/.test(leaky));
check("لا تسريب حالة الاشتراك أو الموافقة", !leaky.includes("subscriptionStatus") && !leaky.includes("publicOptIn"));
check("الحقول العامة تُعرض فقط", leaky.includes("مكتب رقم 1") && leaky.includes("شريك"));

// 10 — RTL وعرض النتيجة بلا كسور
check("النتيجة بلا خزانة عشرية زائدة", one.includes("81%") && !one.includes("81.0"));
const src = readFileSync("src/routes/index.tsx", "utf8");
check("الصفحة الرئيسية بـ dir=rtl", src.includes('dir="rtl"'));

// 11/12 — الصفحة تعمل بلا استجابة ترتيب، والفشل مغلق
check("القسم داخل الصفحة الرئيسية الفعلية", src.includes("<TopOfficesSection />") && src.includes("publicRankingQueryOptions"));
check("لا يُعرض القسم بلا بيانات", src.includes("if (!data) return null;"));
const query = readFileSync("src/lib/operational-score/ranking.query.ts", "utf8");
check("فشل الطلب ⇒ حالة معطّلة", query.includes("enabled: false") && query.includes("catch"));
check("لا منطق أهلية في الواجهة", !src.includes("PUBLIC_MINIMUM_SCORE") && !query.includes("integrity"));

// التنويه الإلزامي والصياغة المحظورة
check("التنويه معروض", one.includes(PUBLIC_RANKING_DISCLAIMER.slice(0, 30)));
for (const banned of ["الأفضل", "أفضل مكتب", "أفضل المحامين", "الأكثر نجاحاً", "الأعلى جودة", "نسبة نجاح"]) {
  check(`صياغة محظورة غائبة: ${banned}`, !many.includes(banned));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"} — ${pass} نجحت، ${failures.length} فشلت`);
if (failures.length > 0) process.exit(1);
