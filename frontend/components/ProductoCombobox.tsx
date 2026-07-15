"use client";

import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { Plus, Sparkles } from "lucide-react";

import { apiFetch } from "@/lib/api";
import type { Candidato, MatchResult } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

const BASE =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60";

// Unidades para el alta rápida de producto desde el buscador.
const UNIDADES_SAT: { code: string; nombre: string }[] = [
  { code: "H87", nombre: "Pieza" }, { code: "KGM", nombre: "Kilogramo" },
  { code: "GRM", nombre: "Gramo" }, { code: "LTR", nombre: "Litro" },
  { code: "MLT", nombre: "Mililitro" }, { code: "XBX", nombre: "Caja" },
  { code: "XPK", nombre: "Paquete" }, { code: "XBG", nombre: "Bolsa" },
  { code: "XSA", nombre: "Saco / Costal" }, { code: "DPC", nombre: "Docena" },
];
const UNIDADES_BASE = ["KILO", "PIEZA", "LITRO", "CAJA", "BULTO", "COSTAL", "MANOJO", "BOLSA"];

export type ProductoPick = {
  producto_id: string;
  sku: string;
  nombre: string;
  presentaciones: Record<string, number>;
  presentacion_default?: string | null;
  unidad_base?: string | null;
};

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
  onPaste,
}: {
  label?: string;
  onSelect: (p: ProductoPick | null, texto: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
}) {
  const [q, setQ] = useState(label ?? "");
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(false);
  const [iaTried, setIaTried] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  // Alta rápida de producto desde el buscador ("+ Crear Producto Nuevo").
  const [createOpen, setCreateOpen] = useState(false);
  const [cNombre, setCNombre] = useState("");
  const [cClaveSat, setCClaveSat] = useState("01010101");
  const [cUnidadSat, setCUnidadSat] = useState("H87");
  const [cUnidadBase, setCUnidadBase] = useState("KILO");
  const [cSaving, setCSaving] = useState(false);

  useEffect(() => setQ(label ?? ""), [label]);
  useEffect(() => setHi(0), [cands]);
  // Enfoca cuando el flujo encadenado apunta a esta caja (no solo al montar).
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setOpen(true);
    }
  }, [autoFocus]);

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
    onSelect({
      producto_id: c.producto_id, sku: c.sku, nombre: c.nombre,
      presentaciones: c.presentaciones, presentacion_default: c.presentacion_default,
      unidad_base: c.unidad_base,
    }, texto);
    setQ(c.nombre);   // solo el nombre, sin SKU
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

  function abrirCrear() {
    setCNombre(q.trim());
    setCClaveSat("01010101"); setCUnidadSat("H87"); setCUnidadBase("KILO");
    setOpen(false);
    setCreateOpen(true);
  }

  async function crearProducto() {
    if (cSaving) return;
    if (!cNombre.trim()) { toast.error("Escribe el nombre del producto"); return; }
    setCSaving(true);
    try {
      const prod = await apiFetch<{
        id: string; sku: string; nombre: string;
        presentaciones: Record<string, number>;
        presentacion_default?: string | null; unidad_base?: string | null;
      }>("/api/v1/productos", {
        method: "POST",
        body: JSON.stringify({
          nombre: cNombre.trim(),
          clave_sat: cClaveSat.trim() || "01010101",
          unidad_sat: cUnidadSat,
          unidad_base: cUnidadBase,
          presentaciones: { [cUnidadBase]: 1 },
          presentacion_default: cUnidadBase,
        }),
      });
      // El producto recién creado se selecciona en esta caja (como un candidato).
      onSelect({
        producto_id: prod.id, sku: prod.sku, nombre: prod.nombre,
        presentaciones: prod.presentaciones, presentacion_default: prod.presentacion_default,
        unidad_base: prod.unidad_base,
      }, prod.nombre);
      setQ(prod.nombre);
      setCreateOpen(false);
      toast.success(`Producto "${prod.nombre}" creado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setCSaving(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
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
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, Math.max(cands.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (cands[hi]) { e.preventDefault(); pick(cands[hi]); } }
          else if (e.key === "Escape") setOpen(false);
        }}
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
            cands.map((c, i) => (
              <button
                key={c.producto_id}
                type="button"
                onClick={() => pick(c)}
                onMouseEnter={() => setHi(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === hi ? "bg-accent/10" : "hover:bg-surface-2"}`}
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
          {!loading && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={abrirCrear}
              className="flex w-full items-center gap-1.5 border-t border-border px-3 py-2 text-left text-sm font-medium text-accent hover:bg-accent/5"
            >
              <Plus size={14} /> Crear Producto Nuevo{q.trim() ? ` «${q.trim()}»` : ""}
            </button>
          )}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo producto"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={cSaving}>Cancelar</Button>
            <Button onClick={crearProducto} disabled={cSaving}>{cSaving ? "Creando…" : "Crear producto"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nombre" required>
              <Input value={cNombre} onChange={(e) => setCNombre(e.target.value)} autoFocus />
            </Field>
          </div>
          <Field label="Unidad base" hint="Unidad de inventario">
            <Select value={cUnidadBase} onChange={(e) => setCUnidadBase(e.target.value)}>
              {UNIDADES_BASE.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="Unidad SAT">
            <Select value={cUnidadSat} onChange={(e) => setCUnidadSat(e.target.value)}>
              {UNIDADES_SAT.map((u) => <option key={u.code} value={u.code}>{u.code} — {u.nombre}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Clave SAT" hint="Producto/servicio (por defecto 01010101 — genérico)">
              <Input value={cClaveSat} onChange={(e) => setCClaveSat(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-muted sm:col-span-2">
            Se crea con lo esencial. Puedes completar categoría, presentaciones e impuestos después en Productos.
          </p>
        </div>
      </Modal>
    </div>
  );
}
