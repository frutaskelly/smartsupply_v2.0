"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type {
  ChangeEvent,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const BASE =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-surface-2 disabled:text-muted disabled:opacity-60";

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} {...rest} className={`${BASE} ${className}`} />;
  },
);

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea {...rest} className={`${BASE} ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Select — dropdown con el diseño de la app (no usa el <select> nativo del SO).
// Mantiene la API del <select>: `value`, `onChange(e => e.target.value)`,
// `disabled`, `className` y `<option>` como hijos. El panel se renderiza en un
// portal con posición fija (flip arriba/abajo) para no recortarse en modales.
// ─────────────────────────────────────────────────────────────────────────────
type Opt = { value: string; label: string; disabled: boolean };

/** Convierte los hijos de un <option> a texto plano (soporta strings concatenados). */
function optionText(node: ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionText).join("");
  if (isValidElement(node)) return optionText((node.props as { children?: ReactNode }).children);
  return "";
}

/** Recoge los <option> (incluidos los que vienen dentro de fragmentos / arrays). */
function collectOptions(children: ReactNode, out: Opt[] = []): Opt[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const p = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
      const label = optionText(p.children);
      out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: !!p.disabled });
    } else {
      // Fragmentos u otros wrappers: baja un nivel.
      collectOptions((child.props as { children?: ReactNode }).children, out);
    }
  });
  return out;
}

/** Siguiente índice habilitado en la dirección dada (salta deshabilitados). */
function nextEnabled(opts: Opt[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < opts.length; i += dir) {
    if (!opts[i].disabled) return i;
  }
  return from >= 0 && from < opts.length && !opts[from]?.disabled ? from : from;
}

export function Select({
  value,
  onChange,
  disabled,
  className = "",
  children,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = useMemo(() => collectOptions(children), [children]);
  const current = value != null ? String(value) : "";
  const selected = options.find((o) => o.value === current) ?? null;

  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const desired = Math.min(options.length * 38 + 8, 288);
    const up = spaceBelow < Math.min(desired, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.floor(up ? spaceAbove : spaceBelow));
    const top = up ? r.top - gap - Math.min(desired, maxHeight) : r.bottom + gap;
    setRect({ left: r.left, top, width: r.width, maxHeight });
  }, [options.length]);

  const openMenu = useCallback(() => {
    if (disabled) return;
    place();
    setHi(Math.max(options.findIndex((o) => o.value === current), 0));
    setOpen(true);
  }, [disabled, place, options, current]);

  // Cierre por clic fuera, Escape, scroll o resize (evita que el panel quede a la deriva).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onClose() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open]);

  function pick(o: Opt) {
    if (o.disabled) return;
    onChange?.({
      target: { value: o.value },
      currentTarget: { value: o.value },
    } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => nextEnabled(options, h, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => nextEnabled(options, h, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = options[hi];
      if (o) pick(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(nextEnabled(options, -1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(nextEnabled(options, options.length, -1));
    }
  }

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm outline-none transition ${
          disabled
            ? "cursor-not-allowed border-border bg-surface-2 text-muted"
            : `cursor-pointer border-border bg-background hover:border-accent/60 focus:border-accent ${
                open ? "border-accent" : ""
              }`
        } ${className}`}
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>
          {selected ? selected.label : " "}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {mounted &&
        open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              maxHeight: rect.maxHeight,
              zIndex: 50,
            }}
            className="overflow-auto rounded-lg border border-border bg-surface shadow-lg"
          >
            {options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">Sin opciones</div>
            ) : (
              options.map((o, i) => {
                const isSel = o.value === current;
                return (
                  <button
                    key={`${o.value}-${i}`}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    disabled={o.disabled}
                    onClick={() => pick(o)}
                    onMouseEnter={() => !o.disabled && setHi(i)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                      o.disabled
                        ? "cursor-not-allowed text-muted/60"
                        : i === hi
                          ? "bg-accent/10"
                          : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check size={15} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        {...rest}
        className={`h-4 w-4 rounded border-border accent-accent disabled:opacity-60 ${className}`}
      />
    );
  },
);

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
        checked ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
