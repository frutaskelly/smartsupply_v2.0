"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

/** Normaliza para comparar sin acentos ni mayúsculas. */
const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// 1) SearchBox — caja de búsqueda sencilla (ícono + limpiar)
// ─────────────────────────────────────────────────────────────────────────────
export function SearchBox({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
  autoFocus,
  "aria-label": ariaLabel = "Buscar",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:border-accent"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) SearchSelect — caja de búsqueda + dropdown (combobox con filtrado local)
// ─────────────────────────────────────────────────────────────────────────────
export type SearchOption = { value: string; label: string; hint?: string };

export function SearchSelect({
  options,
  value,
  onSelect,
  placeholder = "Buscar y seleccionar…",
  emptyText = "Sin coincidencias.",
  className,
}: {
  options: SearchOption[];
  value?: string | null;
  onSelect: (opt: SearchOption | null) => void;
  placeholder?: string;
  emptyText?: ReactNode;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const ql = norm(q.trim());
  const filtered = !open || !ql ? options : options.filter((o) => norm(`${o.label} ${o.hint ?? ""}`).includes(ql));

  // texto visible: lo que se escribe (al estar abierto) o la etiqueta seleccionada
  const text = open ? q : selected?.label ?? "";

  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(o: SearchOption) {
    onSelect(o);
    setQ("");
    setOpen(false);
  }

  function clear() {
    onSelect(null);
    setQ("");
    inputRef.current?.focus();
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={placeholder}
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setQ("");
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && filtered[hi]) {
              e.preventDefault();
              pick(filtered[hi]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-16 text-sm outline-none focus:border-accent"
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {selected && (
          <button
            type="button"
            onClick={clear}
            aria-label="Quitar selección"
            className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown size={15} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </div>

      {open && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">{emptyText}</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pick(o)}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  i === hi ? "bg-accent/10" : "hover:bg-surface-2"
                }`}
              >
                <span className="truncate">
                  <span className="font-medium">{o.label}</span>
                  {o.hint && <span className="ml-2 text-xs text-muted">{o.hint}</span>}
                </span>
                {o.value === value && <Check size={15} className="shrink-0 text-accent" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
