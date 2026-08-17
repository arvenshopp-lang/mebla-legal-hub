/**
 * ==============================================================================
 * MEHLA LEGAL PLATFORM — LEGAL MARKDOWN FORMATTER
 * مفسر ومنسق نصوص الاستشارات القانونية والمذكرات للمحامية بيان
 * يحول نصوص الماركداون والخط العريض والقوائم إلى عناصر منسقة وراقية
 * ==============================================================================
 */
import React from "react";
import { Scale, CheckCircle2, ChevronLeft, Sparkles, BookOpen } from "lucide-react";

interface LegalMarkdownProps {
  content: string;
  className?: string;
}

export function LegalMarkdown({ content, className = "" }: LegalMarkdownProps) {
  if (!content) return null;

  // تقسيم النص إلى فقرات وأسطر
  const lines = content.split("\n");

  const renderedElements: React.ReactNode[] = [];
  let currentListItems: string[] = [];

  function flushList(keyPrefix: string) {
    if (currentListItems.length > 0) {
      renderedElements.push(
        <ul key={`${keyPrefix}-list`} className="my-2.5 space-y-1.5 pr-2">
          {currentListItems.map((item, lIdx) => (
            <li key={lIdx} className="flex items-start gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#123C32] dark:bg-[#C9A961]" />
              <span className="flex-1">{parseInlineFormatting(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentListItems = [];
    }
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // 1. القوائم النقطية (* أو - أو 🔹)
    if (
      trimmed.startsWith("* ") ||
      trimmed.startsWith("- ") ||
      trimmed.startsWith("• ") ||
      trimmed.startsWith("🔹 ") ||
      trimmed.startsWith("⚖️ ") ||
      trimmed.startsWith("📜 ") ||
      trimmed.startsWith("⏱️ ") ||
      trimmed.startsWith("✍️ ")
    ) {
      const cleanItem = trimmed.replace(/^(\*|-|•|🔹|⚖️|📜|⏱️|✍️)\s*/, "");
      currentListItems.push(cleanItem);
      return;
    }

    // إذا لم يكن السطر عنصراً في قائمة، نقوم بتفريغ القائمة المتراكمة
    flushList(`flush-${idx}`);

    // 2. السطر الفارغ
    if (!trimmed) {
      renderedElements.push(<div key={`empty-${idx}`} className="h-2" />);
      return;
    }

    // 3. العناوين الكبيرة (### أو ## أو #)
    if (trimmed.startsWith("### ") || trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
      const title = trimmed.replace(/^#+\s*/, "");
      renderedElements.push(
        <h4
          key={`heading-${idx}`}
          className="mt-3.5 mb-1.5 text-[14.5px] font-bold text-[#123C32] dark:text-[#C9A961] flex items-center gap-1.5 border-b border-[#E6E2D8]/60 dark:border-[#2A3632] pb-1"
        >
          <Scale className="h-3.5 w-3.5" />
          {title}
        </h4>
      );
      return;
    }

    // 4. التنبيهات والتوجيهات المظللة (💡 أو >)
    if (trimmed.startsWith("💡") || trimmed.startsWith(">")) {
      const text = trimmed.replace(/^(💡|>)\s*/, "");
      renderedElements.push(
        <div
          key={`callout-${idx}`}
          className="my-2.5 rounded-xl border border-[#C9A961]/40 bg-[#FBF8F1] dark:bg-[#1C2622] p-3 text-[13px] text-[#1A1A1A] dark:text-gray-200 leading-relaxed shadow-xs"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-[#C9A961] shrink-0 mt-0.5" />
            <div>{parseInlineFormatting(text)}</div>
          </div>
        </div>
      );
      return;
    }

    // 5. الفقرة العادية
    renderedElements.push(
      <p key={`p-${idx}`} className="text-sm leading-relaxed text-[#1A1A1A] dark:text-gray-100 my-1">
        {parseInlineFormatting(line)}
      </p>
    );
  });

  // تفريغ أي قائمة باقية في نهاية النص
  flushList("final");

  return <div className={`space-y-1 ${className}`}>{renderedElements}</div>;
}

/**
 * معالجة التنسيقات الداخلية:
 * - الخط العريض: **نص عريض**
 * - المواد والأنظمة: [نظام ...]
 * - الأكواد والأرقام المرجعية: `رمز`
 */
function parseInlineFormatting(text: string): React.ReactNode {
  if (!text) return "";

  // تقسيم النص بحسب علامات البولد **...**
  const boldRegex = /\*\*(.*?)\*\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    // إضافة النص العادي الذي يسبق البولد
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    // إضافة النص العريض المميز
    parts.push(
      <strong
        key={`bold-${match.index}`}
        className="font-bold text-[#123C32] dark:text-[#E8D49E] px-0.5"
      >
        {match[1]}
      </strong>
    );

    lastIndex = boldRegex.lastIndex;
  }

  // إضافة باقي النص
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
