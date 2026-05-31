"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { Candidato, MatchResult } from "@/lib/types";

const BASE =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";

export type ProductoPick = { producto_id: string; sku: string; nombre: string };

/**
 * Buscador de producto con cruce inteligente (exacto → alias aprendido → difuso → IA).
 * Al elegir un candidato que vino de un texto inexacto, aprende el alias para que
 * la próxima vez se resuelva solo. `texto` se reporta para soporte de pegado Excel.
 */
export function ProductoCombobox({
  label,
  onSelect,
  placeholder = "Buscar producto…",
  autoFocus,
}: {
  label?: string;
  onSelect: (p: ProductoPick | null, texto: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState(label ?? "");
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(false);
  const [iaTried, setIaTried] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(label ?? ""), [label]);

  useEffect(() => {
    if (!open) return;
    const t = q.trim();
    if (t.length < 2) {
      setCands([]);
      return;
    }
    let active = true;
    setLoading(true);
    setIaTried(false);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<MatchResult[]>("/api/v1/productos/match", {
          method: "POST",
          body: JSON.stringify({ textos: [t], usar_ia: false, limit: 8 }),
        });
        if (active) setCands(res[0]?.candidatos ?? []);
      } catch {
        if (active) setCands([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function buscarIa() {
    const t = q.trim();
    if (t.length < 2) return;
    setLoading(true);
    setIaTried(true);
    try {
      const res = await apiFetch<MatchResult[]>("/api/v1/productos/match", {
        method: "POST",
        body: JSON.stringify({ textos: [t], usar_ia: true, limit: 8 }),
      });
      setCands(res[0]?.candidatos ?? []);
    } catch {
      setCands([]);
    } finally {
      setLoading(false);
    }
  }

  async function pick(c: Candidato) {
    const texto = q.trim();
    onSelect({ producto_id: c.producto_id, sku: c.sku, nombre: c.nombre }, texto);
    setQ(`${c.sku} · ${c.nombre}`);
    setOpen(false);
    if (c.origen !== "exacto" && texto && texto.toLowerCase() !== c.nombre.toLowerCase()) {
      // El usuario confirmó el cruce → se aprende para no volver a preguntar.
      try {
        await apiFetch("/api/v1/productos/alias", {
          method: "POST",
          body: JSON.stringify({ texto, producto_id: c.producto_id }),
        });
      } catch {
        /* no bloquea la captura */
      }
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        className={BASE}
        aria-label="Buscar producto"
        value={q}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          onSelect(null, e.target.value); // limpia la selección mientras escribe
        }}
        onFocus={() => setOpen(true)}
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-muted">Buscando…</div>}
          {!loading && cands.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted">
              <div>Sin coincidencias.</div>
              {!iaTried && (
                <button
                  type="button"
                  onClick={buscarIa}
                  className="mt-1 inline-flex items-center gap-1 text-accent hover:underline"
                >
                  <Sparkles size={14} /> Buscar con IA
                </button>
              )}
            </div>
          )}
          {!loading &&
            cands.map((c) => (
              <button
                key={c.producto_id}
                type="button"
                onClick={() => pick(c)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span>
                  <span className="font-medium">{c.nombre}</span>
                  <span className="ml-2 text-xs text-muted">{c.sku}</span>
                </span>
                {c.origen !== "exacto" && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    {c.origen === "ia" ? "IA" : c.origen === "alias" ? "alias" : `${c.score}%`}
                  </span>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
