"use client";

import {
  Children,
  forwardRef,
  isValidElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// Deshabilitado: tono gris suave (relleno + texto atenuado + cursor), en vez de solo opacidad.
const DISABLED =
  "disabled:bg-surface-2 disabled:text-muted disabled:border-border disabled:cursor-not-allowed";
const BASE =
  `w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent ${DISABLED}`;

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
// Select — dropdown con el diseño de la app (NO el nativo del sistema operativo).
// Mantiene la API de <select>: value + onChange(e => e.target.value) + <option> hijos.
// El menú se renderiza en un portal para no recortarse dentro de modales/contenedores
// con overflow. Navegable por teclado (↑/↓, Enter, Esc, Home/End, type-ahead).
// ─────────────────────────────────────────────────────────────────────────────
type Opt = { value: string; label: ReactNode; disabled?: boolean };

function nextEnabled(opts: Opt[], from: number, dir: 1 | -1): number {
  const n = opts.length;
  if (n === 0) return 0;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!opts[i].disabled) return i;
  }
  return from < 0 ? 0 : Math.min(from, n - 1);
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const {
    className = "",
    children,
    value,
    onChange,
    disabled,
    name,
    id,
    "aria-label": ariaLabel,
  } = props;

  // Lee las <option> hijas como items.
  const opts: Opt[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "option") {
      const p = child.props as { value?: unknown; children?: ReactNode; disabled?: boolean };
      const label = p.children;
      const v = p.value ?? (typeof label === "string" ? label : "");
      opts.push({ value: String(v), label, disabled: p.disabled });
    }
  });

  const val = value == null ? "" : String(value);
  const selected = opts.find((o) => o.value === val);

  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [coords, setCoords] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<{ buf: string; t: number }>({ buf: "", t: 0 });

  useEffect(() => setMounted(true), []);

  function reposition() {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const desired = Math.min(288, opts.length * 40 + 8);
    const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
    if (openUp) {
      setCoords({ left: r.left, width: r.width, bottom: window.innerHeight - r.top + gap, maxH: Math.max(120, spaceAbove) });
    } else {
      setCoords({ left: r.left, width: r.width, top: r.bottom + gap, maxH: Math.max(120, spaceBelow) });
    }
  }

  function openMenu() {
    if (disabled) return;
    reposition();
    const idx = opts.findIndex((o) => o.value === val);
    setHi(idx >= 0 ? idx : nextEnabled(opts, -1, 1));
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
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
      document.removeEventListener("mousedown", onDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // mantener el item resaltado a la vista
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector(`[data-idx="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function choose(o: Opt) {
    if (o.disabled) return;
    onChange?.({ target: { value: o.value, name } } as unknown as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    btnRef.current?.focus();
  }

  function typeAhead(key: string) {
    if (key.length !== 1) return;
    taRef.current.buf += key.toLowerCase();
    const buf = taRef.current.buf;
    const idx = opts.findIndex(
      (o) => !o.disabled && typeof o.label === "string" && o.label.toLowerCase().startsWith(buf),
    );
    if (idx >= 0) setHi(idx);
    window.clearTimeout(taRef.current.t);
    taRef.current.t = window.setTimeout(() => {
      taRef.current.buf = "";
    }, 600);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => nextEnabled(opts, h, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => nextEnabled(opts, h, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = opts[hi];
      if (o) choose(o);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setHi(nextEnabled(opts, -1, 1));
    } else if (e.key === "End") {
      e.preventDefault();
      setHi(nextEnabled(opts, opts.length, -1));
    } else {
      typeAhead(e.key);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id={id}
        name={name}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`${BASE} flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${val === "" || !selected ? "text-muted" : ""}`}>
          {selected ? selected.label : "Selecciona…"}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && mounted && coords &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              maxHeight: coords.maxH,
            }}
            className="z-50 overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
          >
            {opts.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted">Sin opciones</div>
            ) : (
              opts.map((o, i) => (
                <button
                  key={i}
                  data-idx={i}
                  type="button"
                  role="option"
                  aria-selected={o.value === val}
                  disabled={o.disabled}
                  onMouseEnter={() => !o.disabled && setHi(i)}
                  onClick={() => choose(o)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    o.disabled
                      ? "cursor-not-allowed text-muted/60"
                      : i === hi
                        ? "bg-accent/10"
                        : "hover:bg-surface-2"
                  } ${o.value === val ? "font-medium" : ""}`}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === val && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
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
