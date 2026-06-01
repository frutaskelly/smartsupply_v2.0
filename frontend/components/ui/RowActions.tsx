"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, GripVertical, MoreVertical, Settings2 } from "lucide-react";

export type RowAction = {
  /** Identificador estable (para recordar orden/visibilidad por tabla). */
  key: string;
  label: string;
  /** Componente de ícono (p. ej. de lucide-react). */
  icon: ComponentType<{ size?: number | string }>;
  onClick: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Oculta la acción por completo (p. ej. por permisos o estado de la fila). */
  hidden?: boolean;
};

const MENU_W = 248; // ancho del menú (px)

function reorder(order: string[], key: string, toIndex: number): string[] {
  const arr = order.filter((k) => k !== key);
  const i = Math.max(0, Math.min(toIndex, arr.length));
  arr.splice(i, 0, key);
  return arr;
}

/**
 * Columna de acciones de fila: hasta `maxVisible` íconos visibles y el resto en
 * un menú de 3 puntos (⋮). El usuario puede mover acciones entre "visibles" y "el
 * menú" con un clic y reordenarlas arrastrando; se recuerda por tabla en
 * localStorage cuando se indica `storageKey`. Buenas prácticas: íconos con
 * aria-label + tooltip, kebab solo cuando hay overflow, menú en portal.
 */
export function RowActions({
  actions,
  maxVisible = 3,
  storageKey,
}: {
  actions: RowAction[];
  maxVisible?: number;
  storageKey?: string;
}) {
  const visibleActions = actions.filter((a) => !a.hidden);
  const allKeys = visibleActions.map((a) => a.key);
  const byKey = Object.fromEntries(visibleActions.map((a) => [a.key, a] as const));

  const [order, setOrder] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => setMounted(true), []);

  // cargar orden recordado
  useEffect(() => {
    if (!storageKey) { loadedRef.current = true; return; }
    try {
      const raw = localStorage.getItem(`dt-actions:${storageKey}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) setOrder(p);
      }
    } catch { /* ignora storage corrupto */ }
    loadedRef.current = true;
  }, [storageKey]);
  // guardar + avisar a las demás filas de la misma tabla (misma storageKey)
  useEffect(() => {
    if (!storageKey || !loadedRef.current) return;
    try { localStorage.setItem(`dt-actions:${storageKey}`, JSON.stringify(order)); } catch { /* noop */ }
    window.dispatchEvent(new CustomEvent(`dt-actions:${storageKey}`, { detail: order }));
  }, [order, storageKey]);
  // sincronizar entre instancias (cada fila monta su propio RowActions)
  useEffect(() => {
    if (!storageKey) return;
    const onSync = (e: Event) => {
      const next = (e as CustomEvent<string[]>).detail;
      setOrder((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    window.addEventListener(`dt-actions:${storageKey}`, onSync as EventListener);
    return () => window.removeEventListener(`dt-actions:${storageKey}`, onSync as EventListener);
  }, [storageKey]);

  // orden efectivo: lo recordado (filtrado) + las acciones nuevas al final
  const effective = [
    ...order.filter((k) => allKeys.includes(k)),
    ...allKeys.filter((k) => !order.includes(k)),
  ];
  const visibleKeys = effective.slice(0, maxVisible);
  const menuKeys = effective.slice(maxVisible);
  const hasOverflow = menuKeys.length > 0;

  function reposition() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const desired = Math.min(360, effective.length * 40 + 96);
    const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
    const left = Math.max(8, r.right - MENU_W);
    if (openUp) setCoords({ left, width: MENU_W, bottom: window.innerHeight - r.top + gap, maxH: Math.max(160, spaceAbove) });
    else setCoords({ left, width: MENU_W, top: r.bottom + gap, maxH: Math.max(160, spaceBelow) });
  }

  function openMenu() {
    reposition();
    setEdit(false);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => reposition();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, effective.length]);

  function iconBtn(a: RowAction) {
    const Icon = a.icon;
    return (
      <button
        key={a.key}
        type="button"
        onClick={a.onClick}
        disabled={a.disabled}
        aria-label={a.label}
        title={a.label}
        className={`rounded-md p-1.5 text-muted hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-muted/40 disabled:hover:bg-transparent ${
          a.tone === "danger" ? "hover:text-danger" : "hover:text-foreground"
        }`}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-0.5">
      {visibleKeys.map((k) => byKey[k] && iconBtn(byKey[k]))}

      {hasOverflow && (
        <button
          ref={btnRef}
          type="button"
          onClick={() => (open ? setOpen(false) : openMenu())}
          aria-label="Más acciones"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Más acciones"
          className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <MoreVertical size={16} />
        </button>
      )}

      {open && mounted && coords &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              maxHeight: coords.maxH,
            }}
            className="z-50 overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
          >
            {!edit ? (
              <>
                {menuKeys.map((k) => {
                  const a = byKey[k];
                  if (!a) return null;
                  const Icon = a.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      disabled={a.disabled}
                      onClick={() => { a.onClick(); setOpen(false); }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                        a.tone === "danger" ? "text-danger hover:bg-danger/10" : "hover:bg-surface-2"
                      }`}
                    >
                      <Icon size={16} />
                      <span className="truncate">{a.label}</span>
                    </button>
                  );
                })}
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  onClick={() => setEdit(true)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-muted hover:bg-surface-2 hover:text-foreground"
                >
                  <Settings2 size={16} />
                  <span>Personalizar acciones</span>
                </button>
              </>
            ) : (
              <div className="px-2 py-1">
                <div className="flex items-center justify-between px-1 pb-1.5">
                  <span className="text-xs font-semibold text-muted">Personalizar acciones</span>
                  <button type="button" onClick={() => setEdit(false)} className="text-xs text-accent hover:underline">
                    Listo
                  </button>
                </div>
                <p className="px-1 pb-1.5 text-[11px] text-muted">
                  Arrastra para reordenar. Las primeras {maxVisible} se muestran como íconos; el resto va al menú.
                </p>
                <ul>
                  {effective.map((k, i) => {
                    const a = byKey[k];
                    if (!a) return null;
                    const Icon = a.icon;
                    const isVisible = i < maxVisible;
                    const showCut = i === maxVisible; // separador "en el menú"
                    return (
                      <li key={k}>
                        {showCut && (
                          <div className="my-1 flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-muted">
                            <span className="h-px flex-1 bg-border" /> En el menú <span className="h-px flex-1 bg-border" />
                          </div>
                        )}
                        <div
                          draggable
                          onDragStart={() => setDragKey(k)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragKey && dragKey !== k) setOrder(reorder(effective, dragKey, effective.indexOf(k)));
                            setDragKey(null);
                          }}
                          className={`flex items-center gap-2 rounded-md px-1 py-1 ${dragKey === k ? "opacity-50" : "hover:bg-surface-2"}`}
                        >
                          <GripVertical size={14} className="shrink-0 cursor-grab text-muted" />
                          <Icon size={15} />
                          <span className="flex-1 truncate">{a.label}</span>
                          {isVisible ? (
                            <button
                              type="button"
                              onClick={() => setOrder(reorder(effective, k, maxVisible))}
                              aria-label="Mover al menú"
                              title="Mover al menú"
                              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
                            >
                              <ChevronDown size={15} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setOrder(reorder(effective, k, maxVisible - 1))}
                              aria-label="Mostrar como ícono"
                              title="Mostrar como ícono"
                              className="rounded p-1 text-muted hover:bg-surface-2 hover:text-accent"
                            >
                              <ChevronUp size={15} />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {storageKey && order.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOrder([])}
                    className="mt-1 px-1 text-[11px] text-muted hover:text-foreground"
                  >
                    Restablecer
                  </button>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
