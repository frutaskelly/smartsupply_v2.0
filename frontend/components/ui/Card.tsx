import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  actions,
  footer,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-background ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <div className="text-sm font-semibold">{title}</div>}
            {subtitle && <div className="text-xs text-muted">{subtitle}</div>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-border px-4 py-3">{footer}</div>}
    </div>
  );
}
