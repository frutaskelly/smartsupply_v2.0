"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { useMutation, useResource, type Page } from "@/lib/hooks";
import type { ListaPrecios, Precio, Producto } from "@/lib/types";

const WRITE = "lista_precios:gestionar";

export default function ListasPreciosPage() {
  const { me } = useAuth();
  const toast = useToast();
  const canWrite = can(me, WRITE);
  const { post, patch, del, loading: saving } = useMutation();

  const listasRes = useResource<Page<ListaPrecios>>("/api/v1/listas-precios?limit=200");
  const productosRes = useResource<Page<Producto>>("/api/v1/productos?limit=200");
  const listas = listasRes.data?.items ?? [];
  const productos = productosRes.data?.items ?? [];
  const prodName = useMemo(
    () => Object.fromEntries(productos.map((p) => [p.id, p.nombre])),
    [productos]
  );

  // ── editor de lista ──
  const [listaForm, setListaForm] = useState<{ id?: string; codigo: string; nombre: string; status: string } | null>(null);

  async function saveLista() {
    if (!listaForm) return;
    if (!listaForm.codigo.trim() || !listaForm.nombre.trim()) {
      toast.error("Código y nombre son obligatorios");
      return;
    }
    const body = { codigo: listaForm.codigo.trim(), nombre: listaForm.nombre.trim(), status: listaForm.status };
    try {
      if (listaForm.id) await patch(`/api/v1/listas-precios/${listaForm.id}`, body);
      else await post("/api/v1/listas-precios", body);
      toast.success("Lista guardada");
      setListaForm(null);
      listasRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  }

  // ── gestor de precios ──
  const [activeLista, setActiveLista] = useState<ListaPrecios | null>(null);
  const [precios, setPrecios] = useState<Precio[]>([]);
  const [loadingPrecios, setLoadingPrecios] = useState(false);
  const [nuevo, setNuevo] = useState({ producto_id: "", presentacion: "KILO", cantidad_minima: "1", precio_unitario: "" });

  async function openPrecios(lista: ListaPrecios) {
    setActiveLista(lista);
    setNuevo({ producto_id: "", presentacion: "KILO", cantidad_minima: "1", precio_unitario: "" });
    await loadPrecios(lista.id);
  }

  async function loadPrecios(listaId: string) {
    setLoadingPrecios(true);
    try {
      const res = await apiFetch<Page<Precio>>(`/api/v1/listas-precios/${listaId}/precios?limit=500`);
      setPrecios(res.items);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los precios");
    } finally {
      setLoadingPrecios(false);
    }
  }

  async function addPrecio() {
    if (!activeLista) return;
    if (!nuevo.producto_id || !nuevo.precio_unitario) {
      toast.error("Elige producto y precio");
      return;
    }
    try {
      await post(`/api/v1/listas-precios/${activeLista.id}/precios`, {
        producto_id: nuevo.producto_id,
        presentacion: nuevo.presentacion.trim() || "KILO",
        cantidad_minima: Number(nuevo.cantidad_minima) || 1,
        precio_unitario: nuevo.precio_unitario,
      });
      toast.success("Precio agregado");
      setNuevo({ producto_id: "", presentacion: "KILO", cantidad_minima: "1", precio_unitario: "" });
      await loadPrecios(activeLista.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar (¿tier duplicado?)");
    }
  }

  async function delPrecio(p: Precio) {
    if (!activeLista) return;
    try {
      await del(`/api/v1/listas-precios/${activeLista.id}/precios/${p.id}`);
      await loadPrecios(activeLista.id);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const [toDelete, setToDelete] = useState<ListaPrecios | null>(null);
  async function confirmDeleteLista() {
    if (!toDelete) return;
    try {
      await del(`/api/v1/listas-precios/${toDelete.id}`);
      toast.success("Lista eliminada");
      setToDelete(null);
      listasRes.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar");
    }
  }

  const columns: Column<ListaPrecios>[] = [
    { header: "Código", cell: (l) => <span className="font-medium">{l.codigo}</span> },
    { header: "Nombre", cell: (l) => l.nombre },
    { header: "Estado", cell: (l) => <Badge tone={l.status === "ACTIVO" ? "success" : "muted"}>{l.status}</Badge> },
    { header: "Moneda", cell: (l) => <span className="text-muted">{l.moneda}</span> },
    {
      header: "",
      className: "text-right w-1",
      cell: (l) => (
        <div className="flex justify-end gap-1">
          <Button variant="secondary" onClick={(e) => { e.stopPropagation(); openPrecios(l); }}>
            <Tag size={14} /> Precios
          </Button>
          {canWrite && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setListaForm({ id: l.id, codigo: l.codigo, nombre: l.nombre, status: l.status }); }}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Editar">
                <Pencil size={16} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setToDelete(l); }}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Eliminar">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Listas de precios"
        subtitle="Niveles de venta (único, menudeo, mayoreo…) con precios por presentación y volumen."
        actions={canWrite ? (
          <Button onClick={() => setListaForm({ codigo: "", nombre: "", status: "ACTIVO" })}>
            <Plus size={16} /> Nueva lista
          </Button>
        ) : undefined}
      />

      <DataTable
        columns={columns}
        rows={listas}
        loading={listasRes.loading}
        error={listasRes.error}
        empty="Sin listas de precios"
        onRowClick={(l) => openPrecios(l)}
      />

      {/* editor de lista */}
      <Modal
        open={listaForm !== null}
        onClose={() => setListaForm(null)}
        title={listaForm?.id ? "Editar lista" : "Nueva lista"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setListaForm(null)}>Cancelar</Button>
            <Button onClick={saveLista} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </>
        }
      >
        {listaForm && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Código" required>
              <Input value={listaForm.codigo} onChange={(e) => setListaForm({ ...listaForm, codigo: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Nombre" required>
              <Input value={listaForm.nombre} onChange={(e) => setListaForm({ ...listaForm, nombre: e.target.value })} />
            </Field>
            <Field label="Estado">
              <Select value={listaForm.status} onChange={(e) => setListaForm({ ...listaForm, status: e.target.value })}>
                <option value="ACTIVO">Activo</option>
                <option value="INACTIVO">Inactivo</option>
              </Select>
            </Field>
          </div>
        )}
      </Modal>

      {/* gestor de precios de la lista */}
      <Modal
        open={activeLista !== null}
        onClose={() => setActiveLista(null)}
        wide
        title={activeLista ? `Precios — ${activeLista.nombre}` : ""}
        footer={<Button variant="secondary" onClick={() => setActiveLista(null)}>Cerrar</Button>}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Cada renglón es un <b>tier por volumen</b>: el precio aplica a partir de “Desde cant.”. Un solo renglón = precio fijo.
          </p>

          {canWrite && (
            <div className="grid grid-cols-2 items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-5">
              <div className="col-span-2">
                <Field label="Producto">
                  <Select value={nuevo.producto_id} onChange={(e) => setNuevo({ ...nuevo, producto_id: e.target.value })}>
                    <option value="">— Elige —</option>
                    {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Present.">
                <Input value={nuevo.presentacion} onChange={(e) => setNuevo({ ...nuevo, presentacion: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Desde cant.">
                <Input type="number" min="1" value={nuevo.cantidad_minima} onChange={(e) => setNuevo({ ...nuevo, cantidad_minima: e.target.value })} />
              </Field>
              <Field label="Precio">
                <div className="flex gap-1">
                  <Input type="number" step="0.0001" value={nuevo.precio_unitario} onChange={(e) => setNuevo({ ...nuevo, precio_unitario: e.target.value })} />
                  <Button onClick={addPrecio} disabled={saving}><Plus size={16} /></Button>
                </div>
              </Field>
            </div>
          )}

          {loadingPrecios ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <DataTable
              columns={[
                { header: "Producto", cell: (p: Precio) => prodName[p.producto_id] ?? p.producto_id },
                { header: "Present.", cell: (p: Precio) => p.presentacion },
                { header: "Desde cant.", cell: (p: Precio) => p.cantidad_minima, className: "text-right" },
                { header: "Precio", cell: (p: Precio) => fmtMoney(p.precio_unitario), className: "text-right" },
                {
                  header: "", className: "text-right w-1",
                  cell: (p: Precio) => canWrite ? (
                    <button onClick={() => delPrecio(p)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-danger" aria-label="Eliminar">
                      <Trash2 size={16} />
                    </button>
                  ) : null,
                },
              ]}
              rows={precios}
              empty="Sin precios en esta lista"
            />
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Eliminar lista"
        message={`¿Eliminar la lista "${toDelete?.nombre}"? Sus precios se quitan también.`}
        onConfirm={confirmDeleteLista}
        onClose={() => setToDelete(null)}
        loading={saving}
      />
    </div>
  );
}
