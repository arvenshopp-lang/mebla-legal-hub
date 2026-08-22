/**
 * شريط ملخص سريع لأداء الفريق: أعلى ثلاثة أعضاء وأكثر ثلاثة تأخراً.
 * مبني كلياً على نتيجة `getTeamPerformance` القائمة — لا استعلام جديد ولا بيانات قضايا.
 */

import { Link } from "@tanstack/react-router";
import { ArrowUpRight, TimerReset } from "lucide-react";
import { ScoreValue } from "@/components/team/performance/kpi-ui";
import type { MemberKpi, PeriodPreset } from "@/lib/kpi/kpi.shared";

const MAX_ITEMS = 3;

type Search = { preset: PeriodPreset; from: string; to: string };

function MemberRow({
  member,
  search,
  trailing,
}: {
  member: MemberKpi;
  search: Search;
  trailing: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <Link
        to="/team-performance/$memberId"
        params={{ memberId: member.userId }}
        search={search}
        className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {member.fullName}
      </Link>
      <span className="shrink-0">{trailing}</span>
    </li>
  );
}

export function TeamHighlights({
  members,
  search,
}: {
  members: MemberKpi[];
  search: Search;
}) {
  const top = members
    .filter((m) => m.eligible && m.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_ITEMS);

  const delayed = members
    .map((m) => ({
      member: m,
      overdue: m.context.overdueDeadlines + m.context.overdueTasks,
    }))
    .filter((row) => row.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, MAX_ITEMS);

  if (top.length === 0 && delayed.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="surface-card p-4" aria-labelledby="team-highlights-top">
        <h2
          id="team-highlights-top"
          className="flex items-center gap-2 text-[13.5px] font-bold text-foreground"
        >
          <ArrowUpRight className="h-4 w-4 text-success" aria-hidden />
          الأعلى أداءً في الفترة
        </h2>
        {top.length === 0 ? (
          <p className="text-caption mt-3">لا يوجد ترتيب موثوق بعد لهذه الفترة.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {top.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                search={search}
                trailing={<ScoreValue score={member.score} tone={member.band?.tone ?? null} />}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card p-4" aria-labelledby="team-highlights-delayed">
        <h2
          id="team-highlights-delayed"
          className="flex items-center gap-2 text-[13.5px] font-bold text-foreground"
        >
          <TimerReset className="h-4 w-4 text-warning" aria-hidden />
          الأكثر تأخراً الآن
        </h2>
        {delayed.length === 0 ? (
          <p className="text-caption mt-3">لا توجد أعمال متأخرة على أي عضو حالياً.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {delayed.map((row) => (
              <MemberRow
                key={row.member.userId}
                member={row.member}
                search={search}
                trailing={
                  <span className="text-[12.5px] font-semibold tabular-nums text-danger">
                    {row.overdue} عملاً متأخراً
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
