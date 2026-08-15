/**
 * Top 5 public offices — marketing component (future wiring only).
 *
 * Rules:
 * - Pure props-driven; no backend calls, no mock data.
 * - Renders null when disabled or empty.
 * - Shows at most 5 items; never pads with fake data.
 * - Contains no internal IDs, client data, case data, or raw metrics.
 */

import { cn } from "@/lib/utils";
import { fmtPercent } from "@/lib/format";
import {
  PUBLIC_RESULTS_COUNT,
  PUBLIC_SECTION_INTRO,
  PUBLIC_SECTION_TITLE,
  PUBLIC_RANKING_DISCLAIMER,
  sanitizePublicRankingItems,
  type PublicOperationalRanking,
} from "@/lib/operational-score/score.shared";

const rankLabels: Record<number, string> = {
  1: "الأول",
  2: "الثاني",
  3: "الثالث",
  4: "الرابع",
  5: "الخامس",
};

function RankBadge({ rank, isFirst }: { rank: number; isFirst: boolean }) {
  const padded = String(rank).padStart(2, "0");
  return (
    <span
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-m)] text-[15px] font-bold tabular-nums leading-none",
        isFirst
          ? "bg-primary text-primary-foreground"
          : "bg-surface-muted text-muted-foreground",
      )}
      aria-label={`المرتبة ${rankLabels[rank] ?? rank}`}
    >
      {padded}
    </span>
  );
}

function OfficeLogo({ url, name }: { url?: string | null; name: string }) {
  if (!url) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-s)] border border-border bg-surface-muted"
        aria-hidden
      >
        <span className="h-2 w-2 rounded-full bg-border-strong" />
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="h-9 w-9 shrink-0 rounded-[var(--radius-s)] border border-border object-cover"
    />
  );
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        <span className="text-[15px] font-bold tabular-nums text-foreground">
          {fmtPercent(clamped, 0)}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-label={`مؤشر الإنجاز التشغيلي: ${fmtPercent(clamped, 0)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function TopOffices({ ranking }: { ranking: PublicOperationalRanking }) {
  if (!ranking.enabled) return null;

  const items = sanitizePublicRankingItems(ranking.items);
  if (items.length === 0) return null;

  return (
    <section className="border-b border-border bg-surface py-14 md:py-20">
      <div className="container-page">
        <header className="mb-8 md:mb-10">
          <h2 className="text-h2">{PUBLIC_SECTION_TITLE}</h2>
          <p className="measure mt-3 text-body-lg text-muted-foreground">
            {PUBLIC_SECTION_INTRO}
          </p>
        </header>

        <ol
          className="space-y-3"
          aria-label={`أفضل ${Math.min(items.length, PUBLIC_RESULTS_COUNT)} مكاتب`}
        >
          {items.map((item, index) => {
            const isFirst = index === 0;
            return (
              <li
                key={`top-office-${item.rank}`}
                className={cn(
                  "rounded-[var(--radius-l)] border bg-surface p-4 transition-shadow duration-200 ease-out motion-reduce:transition-none md:p-5",
                  isFirst
                    ? "border-primary/30 shadow-[inset_-1px_0_0_0_var(--color-primary-raw)]"
                    : "border-border hover:shadow-[var(--elevation-s)]",
                )}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
                  <div className="flex items-center gap-3 md:gap-4">
                    <RankBadge rank={item.rank} isFirst={isFirst} />
                    <div className="flex items-center gap-3">
                      <OfficeLogo url={item.logoUrl} name={item.publicName} />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-foreground">
                          {item.publicName}
                        </p>
                        {item.badge && (
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {item.badge}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <ScoreBar score={item.score} label="مؤشر الإنجاز التشغيلي" />
                </div>
              </li>
            );
          })}
        </ol>

        <footer className="mt-6 md:mt-8">
          <p className="text-caption max-w-3xl">{PUBLIC_RANKING_DISCLAIMER}</p>
          {ranking.computedAt && (
            <p className="text-caption mt-2">
              آخر تحديث: {new Date(ranking.computedAt).toLocaleDateString("ar-SA")}
            </p>
          )}
        </footer>
      </div>
    </section>
  );
}
