"use client";

import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  empty,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  empty?: string;
  onRowClick?: (row: T) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return <EmptyState title={empty ?? "Sin resultados"} />;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={`px-4 py-2.5 font-medium ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              onClick={() => onRowClick?.(row)}
              className={`border-t border-border ${onRowClick ? "cursor-pointer hover:bg-surface-2" : ""}`}
            >
              {columns.map((c, ci) => (
                <td key={ci} className={`px-4 py-2.5 ${c.className ?? ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
