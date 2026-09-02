"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Feed" },
  { href: "/sources", label: "Sources" },
];

export function TabNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-rule-strong bg-panel">
      <div className="mx-auto flex max-w-[1400px] items-baseline gap-6 px-4 py-2">
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Mobile gaming news hub
        </span>
        <nav aria-label="Sections" className="flex items-baseline gap-4">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`border-b-2 pb-1 text-[14px] ${
                  active
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-meta hover:text-ink"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
