"use client";

import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

// Unidades para el alta rápida de producto (mismas que el buscador de producto).
const UNIDADES_SAT: { code: string; nombre: string }[] = [
  { code: "H87", nombre: "Pieza" }, { code: "KGM", nombre: "Kilogramo" },
  { code: "GRM", nombre: "Gramo" }, { code: "LTR", nombre: "Litro" },
  { code: "MLT", nombre: "Mililitro" }, { code: "XBX", nombre: "Caja" },
  { code: "XPK", nombre: "Paquete" }, { code: "XBG", nombre: "Bolsa" },
  { code: "XSA", nombre: "Saco / Costal" }, { code: "DPC", nombre: "Docena" },
];
const UNIDADES_BASE = ["KILO", "PIEZA", "LITRO", "CAJA", "BULTO", "COSTAL", "MANOJO", "BOLSA"];

// Unidad SAT correspondiente a cada unidad base (default; el usuario puede cambiarla).
const SAT_POR_BASE: Record<string, string> = {
  KILO: "KGM", PIEZA: "H87", LITRO: "LTR", CAJA: "XBX",
  BULTO: "XSA", COSTAL: "XSA", MANOJO: "H87", BOLSA: "XBG",
};
const satPorBase = (base: string) => SAT_POR_BASE[base] ?? "H87";

export type ProductoCreado = {
  id: string;
  sku: string;
  nombre: string;
  presentaciones: Record<string, number>;
  presentacion_default?: string | null;
  unidad_base?: string | null;
};

/**
 * Modal de alta rápida de producto (lo esencial: nombre, unidad base, unidad y
 * clave SAT). Reutilizable: lo usa el buscador de producto y la columna Match IA
 * del pegado de Excel. Al crear, devuelve el producto por `onCreated` y cierra.
 */
export function CrearProductoModal({
  open,
  onClose,
  nombreInicial = "",
  unidadBaseInicial = "KILO",
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  nombreInicial?: string;
  unidadBaseInicial?: string;
  onCreated: (p: ProductoCreado) => void;
}) {
  const toast = useToast();
  const [cNombre, setCNombre] = useState(nombreInicial);
  const [cClaveSat, setCClaveSat] = useState("01010101");
  const [cUnidadBase, setCUnidadBase] = useState(unidadBaseInicial);
  const [cUnidadSat, setCUnidadSat] = useState(satPorBase(unidadBaseInicial));
  const [cSaving, setCSaving] = useState(false);

  // Reinicia los campos con los valores iniciales cada vez que se abre.
  useEffect(() => {
    if (!open) return;
    const base = unidadBaseInicial || "KILO";
    setCNombre(nombreInicial);
    setCClaveSat("01010101");
    setCUnidadBase(base);
    setCUnidadSat(satPorBase(base));   // la unidad SAT sigue a la base por default
  }, [open, nombreInicial, unidadBaseInicial]);

  async function crearProducto() {
    if (cSaving) return;
    if (!cNombre.trim()) { toast.error("Escribe el nombre del producto"); return; }
    setCSaving(true);
    try {
      const prod = await apiFetch<ProductoCreado>("/api/v1/productos", {
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
      onCreated(prod);
      toast.success(`Producto "${prod.nombre}" creado`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el producto");
    } finally {
      setCSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo producto"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={cSaving}>Cancelar</Button>
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
          <Select value={cUnidadBase} onChange={(e) => { const b = e.target.value; setCUnidadBase(b); setCUnidadSat(satPorBase(b)); }}>
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
  );
}
