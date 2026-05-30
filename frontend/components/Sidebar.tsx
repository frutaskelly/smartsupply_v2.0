"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { can, type Me } from "@/lib/auth";
import { NAV } from "@/lib/nav";

export function Sidebar({ me }: { me: Me }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center px-5 text-base font-semibold tracking-tight">
        SmartSupply
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((section) => {
          const items = section.items.filter((it) => can(me, it.perm));
          if (items.length === 0) return null;
          return (
            <div key={section.section} className="mt-5 first:mt-2">
              <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted">
                {section.section}
              </div>
              {items.map((it) => {
                const active =
                  pathname === it.href || pathname.startsWith(it.href + "/");
                const Icon = it.icon;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition ${
                      active
                        ? "bg-surface-2 font-medium text-foreground"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon size={18} />
                    {it.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
