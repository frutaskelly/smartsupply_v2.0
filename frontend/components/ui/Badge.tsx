import type { ReactNode } from "react";

type Tone = "default" | "success" | "warning" | "danger" | "muted" | "accent";

const TONES: Record<Tone, string> = {
  default: "bg-surface-2 text-foreground",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  muted: "bg-surface-2 text-muted",
  accent: "bg-blue-50 text-blue-700",
};

export function Badge({ tone = "default", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
