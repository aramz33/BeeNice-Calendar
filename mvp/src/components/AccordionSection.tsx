import type { ReactNode } from "react";

interface AccordionSectionProps {
  title: string;
  count?: number;
  children: ReactNode;
}

export function AccordionSection({
  title,
  count,
  children,
}: AccordionSectionProps) {
  return (
    <details className="group rounded-2xl border border-[#001E5B]/8 bg-white">
      <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 marker:content-none">
        <span className="font-display text-sm font-medium text-[#001E5B]">
          {title}
          {count !== undefined && (
            <span className="ml-2 rounded-full bg-[#001E5B]/8 px-2 py-0.5 text-xs">
              {count}
            </span>
          )}
        </span>
        <svg
          className="h-4 w-4 text-[#001E5B]/40 transition-transform duration-200 group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </summary>
      <div className="border-t border-[#001E5B]/8 px-5 py-4">{children}</div>
    </details>
  );
}
