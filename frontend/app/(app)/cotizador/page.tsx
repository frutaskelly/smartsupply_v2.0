"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";

import { ProductoCombobox, type ProductoPick } from "@/components/ProductoCombobox";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
import { useResource, type Page } from "@/lib/hooks";
import type { Cliente, Cotizacion, Sucursal } from "@/lib/types";

const ORIGEN_LABEL: Record<string, string> = {
  override_sucursal: "Precio especial de la sucursal",
  override_cliente: "Precio especial del cliente",
  lista_sucursal: "Lista de la sucursal",
  lista_cliente: "Lista del cliente",
  lista_base: "Lista base (público)",
};

export default function CotizadorPage() {
  const toast = useToast();

  const clientesRes = useResource<Page<Cliente>>("/api/v1/clientes?limit=200");
  const clientes = clientesRes.data?.items ?? [];

  const [clienteId, setClienteId] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [sucursalId, setSucursalId] = useState("");

  const [prod, setProd] = useState<ProductoPick | null>(null);
  const [presentacion, setPresentacion] = useState("");
  const [cantidad, setCantidad] = useState("1");

  const [cotRes, setCotRes] = useState<Cotizacion | null>(null);

  // Presentaciones válidas del producto elegido, con su default al frente. El
  // precio se guarda por presentación, así que cotizar con una que no existe
  // ("KILO" en un producto que se vende por "PIEZA") no resuelve precio.
  const presentaciones = useMemo(() => {
    if (!prod) return [];
    const keys = Object.keys(prod.presentaciones ?? {});
    const def = prod.presentacion_default ?? prod.unidad_base ?? "";
    return def && keys.includes(def) ? [def, ...keys.filter((k) => k !== def)] : keys;
  }, [prod]);

  // Carga las sucursales del cliente elegido (la sucursal es opcional).
  useEffect(() => {
    if (!clienteId) {
      setSucursales([]);
      setSucursalId("");
      return;
    }
    let active = true;
    (async () => {
      try {
        const r = await apiFetch<Page<Sucursal>>(`/api/v1/sucursales?cliente_id=${clienteId}&limit=200`);
        if (active) setSucursales(r.items);
      } catch (e) {
        if (active) toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las sucursales");
      }
    })();
    setSucursalId("");
    return () => {
      active = false;
    };
  }, [clienteId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPickProducto(p: ProductoPick | null) {
    setProd(p);
    setCotRes(null);
    const def = p?.presentacion_default ?? p?.unidad_base ?? "";
    const keys = Object.keys(p?.presentaciones ?? {});
    setPresentacion(def && keys.includes(def) ? def : keys[0] ?? "");
  }

  async function cotizar() {
    if (!prod) {
      toast.error("Elige un producto");
      return;
    }
    const p = new URLSearchParams({
      producto_id: prod.producto_id,
      presentacion: presentacion || "KILO",
      cantidad: cantidad || "1",
    });
    // La sucursal gana sobre el cliente; sin ninguno, resuelve la lista base.
    if (sucursalId) p.set("sucursal_id", sucursalId);
    else if (clienteId) p.set("cliente_id", clienteId);
    try {
      setCotRes(await apiFetch<Cotizacion>(`/api/v1/precios/cotizar?${p.toString()}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cotizar");
    }
  }

  return (
    <div>
      <PageHeader title="Cotizador" subtitle="Precio resuelto por cliente / sucursal / lista." />

      <section className="max-w-3xl rounded-xl border border-border p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Calculator size={15} /> Cotizador (precio resuelto)
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select
              value={clienteId}
              onChange={(e) => {
                setClienteId(e.target.value);
                setCotRes(null);
              }}
            >
              <option value="">— Sin cliente (lista base) —</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legal_name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sucursal">
            <Select
              value={sucursalId}
              onChange={(e) => {
                setSucursalId(e.target.value);
                setCotRes(null);
              }}
              disabled={!clienteId || sucursales.length === 0}
            >
              <option value="">(usa el cliente)</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-foreground">Producto</label>
            <ProductoCombobox onSelect={onPickProducto} />
          </div>
          <Field label="Presentación">
            <Select
              value={presentacion}
              onChange={(e) => setPresentacion(e.target.value)}
              disabled={!prod}
            >
              {presentaciones.length === 0 && <option value="">—</option>}
              {presentaciones.map((pr) => (
                <option key={pr} value={pr}>
                  {pr}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cantidad">
            <Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </Field>
        </div>

        <div className="mt-3">
          <Button onClick={cotizar} disabled={!prod}>
            Cotizar
          </Button>
        </div>

        {cotRes && (
          <div className="mt-3 rounded-lg bg-surface-2 px-4 py-3 text-sm">
            {cotRes.precio != null ? (
              <>
                Precio: <b>{fmtMoney(cotRes.precio)}</b> · origen:{" "}
                <b>{ORIGEN_LABEL[cotRes.origen ?? ""] ?? cotRes.origen ?? "—"}</b>
              </>
            ) : (
              <span className="text-danger">Sin precio resoluble (configura una lista u override).</span>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
