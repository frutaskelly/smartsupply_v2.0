"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, Eye, EyeOff, GripVertical } from "lucide-react";

import { EmptyState } from "./EmptyState";
import { Spinner } from "./Spinner";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Identificador estable para orden/visibilidad/ancho. Por defecto usa `header`. */
  key?: string;
  /** Habilita ordenar por esta columna. Clic en el encabezado alterna:
   *  ascendente → descendente → sin orden. */
  sortable?: boolean;
  /** Valor a comparar al ordenar. Indícalo cuando `cell` no devuelve un
   *  texto/número simple (p. ej. un Badge o JSX). */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Excluye la columna del menú de columnas y la deja fija (al final). Las
   *  columnas con encabezado vacío (acciones) se fijan automáticamente. */
  fixed?: boolean;
  /** Valor a escribir al exportar a Excel/CSV. Si no se indica, usa `sortValue`
   *  o el `cell` cuando sea texto/número. Las columnas de acciones se omiten. */
  exportValue?: (row: T) => string | number | null | undefined;
};

type SortState = { id: string; dir: "asc" | "desc" };

const MIN_W = 64; // ancho mínimo de columna al redimensionar (px)

function comparable<T>(col: Column<T>, row: T): string | number | null {
  const raw = col.sortValue ? col.sortValue(row) : col.cell(row);
  if (raw == null) return null;
  return typeof raw === "number" || typeof raw === "string" ? raw : null;
}

/** Valor textual para exportar: `exportValue` → `sortValue` → `cell` (si es
 *  texto/número). JSX sin un accessor explícito sale vacío. */
function exportText<T>(col: Column<T>, row: T): string {
  const raw = col.exportValue
    ? col.exportValue(row)
    : col.sortValue
      ? col.sortValue(row)
      : col.cell(row);
  if (raw == null) return "";
  return typeof raw === "number" || typeof raw === "string" ? String(raw) : "";
}

/** Escapa un campo CSV (comillas dobles, comas, saltos de línea). */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Genera el CSV (con BOM UTF-8 para que Excel respete acentos) y dispara la
 *  descarga. Excel abre el .csv como hoja de cálculo con un doble clic. */
function downloadCsv(headers: string[], matrix: string[][], filename: string) {
  const lines = [headers, ...matrix].map((r) => r.map(csvCell).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Normaliza para búsqueda: minúsculas + sin acentos. */
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  error,
  empty,
  onRowClick,
  columnsMenu,
  resizable,
  exportable,
  exportFilename = "tabla",
  storageKey,
  searchable,
  searchPlaceholder,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  empty?: string;
  onRowClick?: (row: T) => void;
  /** Muestra el botón "Columnas" para mostrar/ocultar y reordenar columnas. */
  columnsMenu?: boolean;
  /** Permite cambiar el ancho de las columnas arrastrando el borde derecho. */
  resizable?: boolean;
  /** Muestra el botón "Excel" para descargar la tabla (respeta columnas
   *  visibles, su orden y el ordenamiento actual). */
  exportable?: boolean;
  /** Nombre base del archivo descargado (sin extensión). */
  exportFilename?: string;
  /** Si se indica, recuerda orden/visibilidad/ancho en localStorage bajo esta clave. */
  storageKey?: string;
  /** Muestra un buscador que filtra (cliente) sobre TODAS las columnas:
   *  normalizado (sin acentos/mayúsculas) y por tokens (cada palabra debe aparecer). */
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  // ── identidad estable de cada columna ──
  const cols = useMemo(() => {
    const seen = new Map<string, number>();
    return columns.map((col, i) => {
      let base = col.key ?? col.header ?? "";
      if (base.trim() === "") base = `col-${i}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      const manageable = !col.fixed && col.header.trim() !== "";
      return { col, id, manageable };
    });
  }, [columns]);
  const byId = useMemo(() => Object.fromEntries(cols.map((c) => [c.id, c])), [cols]);
  const managedIds = useMemo(() => cols.filter((c) => c.manageable).map((c) => c.id), [cols]);

  // ── estado de orden de filas (por id de columna) ──
  const [sort, setSort] = useState<SortState | null>(null);
  const [search, setSearch] = useState("");

  // ── estado del menú de columnas ──
  const [order, setOrder] = useState<string[]>([]); // orden explícito de columnas manejables
  const [hidden, setHidden] = useState<string[]>([]);
  const [widths, setWidths] = useState<Record<string, number>>({}); // ancho px por id
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  // persistencia
  useEffect(() => {
    if (!storageKey) { loadedRef.current = true; return; }
    try {
      const raw = localStorage.getItem(`dt:${storageKey}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.order)) setOrder(p.order);
        if (Array.isArray(p.hidden)) setHidden(p.hidden);
        if (p.widths && typeof p.widths === "object") setWidths(p.widths);
      }
    } catch { /* ignora storage corrupto */ }
    loadedRef.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey || !loadedRef.current) return;
    try { localStorage.setItem(`dt:${storageKey}`, JSON.stringify({ order, hidden, widths })); } catch { /* noop */ }
  }, [order, hidden, widths, storageKey]);

  // cerrar el menú al hacer clic fuera / Escape
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  // orden efectivo de columnas manejables (reconcilia con columnas actuales)
  const effectiveOrder = useMemo(() => {
    const fromState = order.filter((id) => managedIds.includes(id));
    const missing = managedIds.filter((id) => !fromState.includes(id));
    return [...fromState, ...missing];
  }, [order, managedIds]);

  // columnas a renderizar: manejables (en orden, visibles) + fijas al final
  const renderCols = useMemo(() => {
    if (!columnsMenu) return cols;
    const visible = effectiveOrder.filter((id) => !hidden.includes(id)).map((id) => byId[id]);
    const fixed = cols.filter((c) => !c.manageable);
    return [...visible, ...fixed];
  }, [columnsMenu, cols, effectiveOrder, hidden, byId]);

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const entry = byId[sort.id];
    if (!entry?.col.sortable) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = comparable(entry.col, a);
      const vb = comparable(entry.col, b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" }) * factor;
    });
  }, [rows, byId, sort]);

  // ── búsqueda (cliente, todas las columnas, normalizada, por tokens) ──
  const filteredRows = useMemo(() => {
    const q = norm(search.trim());
    if (!q) return sortedRows;
    const tokens = q.split(/\s+/).filter(Boolean);
    return sortedRows.filter((row) => {
      const text = norm(cols.map(({ col }) => exportText(col, row)).join("  "));
      return tokens.every((t) => text.includes(t));
    });
  }, [sortedRows, search, cols]);

  function toggleSort(id: string) {
    setSort((s) => {
      if (!s || s.id !== id) return { id, dir: "asc" };
      if (s.dir === "asc") return { id, dir: "desc" };
      return null;
    });
  }
  function toggleHidden(id: string) {
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));
  }
  function dropOn(targetId: string) {
    setOrder(() => {
      const base = effectiveOrder.slice();
      if (!dragId || dragId === targetId) return base;
      const from = base.indexOf(dragId);
      if (from < 0) return base;
      base.splice(from, 1);
      base.splice(base.indexOf(targetId), 0, dragId);
      return base;
    });
    setDragId(null);
  }

  // ── redimensionar columnas ──
  const theadRef = useRef<HTMLTableSectionElement>(null);
  function startResize(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.currentTarget as HTMLElement).closest("th") as HTMLElement | null;
    const startX = e.clientX;
    const startW = th?.getBoundingClientRect().width ?? widths[id] ?? MIN_W;
    // El ancho máximo se acota para no desbordar la tabla: lo que mide la tabla
    // menos el espacio mínimo que necesitan las demás columnas visibles.
    const tableW = theadRef.current?.closest("table")?.getBoundingClientRect().width ?? Infinity;
    const otherCols = Math.max(0, renderCols.length - 1);
    const maxW = Math.max(MIN_W, tableW - otherCols * MIN_W);

    function onMove(ev: MouseEvent) {
      const next = Math.min(maxW, Math.max(MIN_W, startW + (ev.clientX - startX)));
      setWidths((w) => ({ ...w, [id]: Math.round(next) }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // ── exportar a Excel (CSV) ──
  function doExport() {
    const expCols = renderCols.filter(({ col }) => col.header.trim() !== ""); // sin columna de acciones
    const headers = expCols.map(({ col }) => col.header);
    const matrix = filteredRows.map((row) => expCols.map(({ col }) => exportText(col, row)));
    downloadCsv(headers, matrix, exportFilename);
  }

  const customized = order.length > 0 || hidden.length > 0 || Object.keys(widths).length > 0;
  const hasToolbar = searchable || columnsMenu || exportable;

  const toolbar = hasToolbar ? (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex-1">
        {searchable && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder ?? "Buscar en la tabla…"}
            className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        )}
      </div>
      <div className="flex shrink-0 gap-2">
      {exportable && (
        <button
          type="button"
          onClick={doExport}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
          title="Descargar la tabla en Excel"
        >
          <Download size={15} /> Excel
        </button>
      )}
      {columnsMenu && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Columns3 size={15} /> Columnas
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-background shadow-xl">
              <div className="border-b border-border px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Columnas</div>
                <p className="mt-0.5 text-xs text-muted">Arrastra ⠿ para reordenar. Toggle 👁 para mostrar/ocultar.</p>
              </div>
              <div className="max-h-72 overflow-auto py-1">
                {effectiveOrder.map((id) => {
                  const entry = byId[id];
                  if (!entry) return null;
                  const isHidden = hidden.includes(id);
                  return (
                    <div
                      key={id}
                      draggable
                      onDragStart={() => setDragId(id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => dropOn(id)}
                      onDragEnd={() => setDragId(null)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${dragId === id ? "opacity-40" : ""}`}
                    >
                      <GripVertical size={15} className="shrink-0 cursor-grab text-muted" />
                      <span className={`flex-1 truncate ${isHidden ? "text-muted line-through" : ""}`}>{entry.col.header}</span>
                      <button
                        type="button"
                        onClick={() => toggleHidden(id)}
                        aria-label={isHidden ? "Mostrar" : "Ocultar"}
                        className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                      >
                        {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  );
                })}
              </div>
              {customized && (
                <div className="border-t border-border px-2.5 py-1.5">
                  <button type="button" onClick={() => { setOrder([]); setHidden([]); setWidths({}); }} className="text-xs text-muted hover:text-foreground">
                    Restablecer
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  ) : null;

  const hasWidths = resizable && Object.keys(widths).length > 0;

  let body: ReactNode;
  if (loading) {
    body = <div className="flex justify-center py-16"><Spinner /></div>;
  } else if (error) {
    body = <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  } else if (rows.length === 0) {
    body = <EmptyState title={empty ?? "Sin resultados"} />;
  } else {
    body = (
      <div className="overflow-x-auto rounded-xl border border-border">
        {/* table-fixed solo cuando hay anchos definidos, para que se respeten. */}
        <table className={`w-full text-sm ${hasWidths ? "table-fixed" : ""}`}>
          {hasWidths && (
            <colgroup>
              {renderCols.map(({ id }) => (
                <col key={id} style={widths[id] ? { width: widths[id] } : undefined} />
              ))}
            </colgroup>
          )}
          <thead ref={theadRef} className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              {renderCols.map(({ col, id }, ci) => {
                const active = sort?.id === id;
                const Icon = active ? (sort!.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                const canResize = resizable && ci < renderCols.length - 1; // no en la última
                return (
                  <th
                    key={id}
                    className={`relative px-4 py-2.5 font-medium ${col.className ?? ""}`}
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(id)}
                        className={`-ml-1 inline-flex max-w-full items-center gap-1 truncate rounded px-1 py-0.5 transition hover:text-foreground ${active ? "text-foreground" : ""}`}
                        title="Ordenar"
                      >
                        <span className="truncate">{col.header}</span>
                        <Icon size={13} className={active ? "shrink-0" : "shrink-0 opacity-40"} />
                      </button>
                    ) : (
                      <span className="block truncate">{col.header}</span>
                    )}
                    {canResize && (
                      <span
                        onMouseDown={(e) => startResize(e, id)}
                        onClick={(e) => e.stopPropagation()}
                        role="separator"
                        aria-orientation="vertical"
                        title="Arrastra para cambiar el ancho"
                        className="absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none items-center justify-center hover:bg-accent/20"
                      >
                        <span className="h-1/2 w-px bg-border" />
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={renderCols.length} className="px-4 py-8 text-center text-sm text-muted">
                  Sin coincidencias{search.trim() ? ` para “${search.trim()}”` : ""}
                </td>
              </tr>
            ) : (
              filteredRows.map((row, ri) => (
                <tr
                  key={ri}
                  onClick={() => onRowClick?.(row)}
                  className={`border-t border-border ${onRowClick ? "cursor-pointer hover:bg-surface-2" : ""}`}
                >
                  {renderCols.map(({ col, id }) => (
                    <td key={id} className={`px-4 py-2.5 ${hasWidths ? "truncate" : ""} ${col.className ?? ""}`}>
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {toolbar}
      {body}
    </div>
  );
}
