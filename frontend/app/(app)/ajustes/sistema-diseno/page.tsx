"use client";

import { useState } from "react";
import { Check, Eye, Pencil, Plus, Trash2 } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column, type RowAction } from "@/components/ui/DataTable";
import { DataTableSmart } from "@/components/ui/DataTableSmart";
import { EmptyState } from "@/components/ui/EmptyState";
import { Checkbox, Field, Input, Select, Switch, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchBox, SearchSelect, type SearchOption } from "@/components/ui/SearchBox";
import { Spinner } from "@/components/ui/Spinner";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";

const SWATCHES = [
  { name: "background", cls: "bg-background border border-border" },
  { name: "surface-2", cls: "bg-surface-2" },
  { name: "accent", cls: "bg-accent" },
  { name: "danger", cls: "bg-danger" },
  { name: "border", cls: "bg-border" },
  { name: "foreground", cls: "bg-foreground" },
];

type Demo = { id: number; nombre: string; estado: string };
const DEMO_ROWS: Demo[] = [
  { id: 1, nombre: "Jitomate saladette", estado: "Activo" },
  { id: 2, nombre: "Aceite Nutrioli 850 ml", estado: "Activo" },
  { id: 3, nombre: "Coca-Cola 600 ml", estado: "Inactivo" },
  { id: 4, nombre: "Plátano Tabasco", estado: "Activo" },
  { id: 5, nombre: "Lechuga romana", estado: "Activo" },
  { id: 6, nombre: "Papel higiénico 4 rollos", estado: "Inactivo" },
];

const UNIDADES_SAT: SearchOption[] = [
  { value: "KGM", label: "Kilogramo", hint: "KGM" },
  { value: "H87", label: "Pieza", hint: "H87" },
  { value: "LTR", label: "Litro", hint: "LTR" },
  { value: "XBX", label: "Caja", hint: "XBX" },
  { value: "MTR", label: "Metro", hint: "MTR" },
  { value: "GRM", label: "Gramo", hint: "GRM" },
  { value: "XPK", label: "Paquete", hint: "XPK" },
  { value: "E48", label: "Unidad de servicio", hint: "E48" },
];

export default function SistemaDisenoPage() {
  const toast = useToast();
  const [sw, setSw] = useState(true);
  const [chk, setChk] = useState(true);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [unidadSat, setUnidadSat] = useState<string | null>("KGM");
  const [sel, setSel] = useState("a");

  const cols: Column<Demo>[] = [
    { header: "ID", cell: (r) => r.id, className: "w-1", sortable: true, sortValue: (r) => r.id },
    { header: "Nombre", cell: (r) => <span className="font-medium">{r.nombre}</span>, sortable: true, sortValue: (r) => r.nombre },
    {
      header: "Estado",
      cell: (r) => <Badge tone={r.estado === "Activo" ? "success" : "muted"}>{r.estado}</Badge>,
      sortable: true,
      sortValue: (r) => r.estado,
    },
  ];

  // Columna de acciones: 3 íconos configurables (reordenar/ocultar con el menú ⋮).
  const rowActions: RowAction<Demo>[] = [
    { id: "ver", label: "Ver", icon: <Eye size={16} />, onClick: (r) => toast.success(`Ver ${r.nombre}`) },
    { id: "editar", label: "Editar", icon: <Pencil size={16} />, onClick: (r) => toast.success(`Editar ${r.nombre}`) },
    { id: "eliminar", label: "Eliminar", icon: <Trash2 size={16} />, tone: "danger", onClick: (r) => toast.error(`Eliminar ${r.nombre}`) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sistema de diseño"
        subtitle="Tokens, tipografía y todos los componentes reutilizables de la app."
      />

      {/* Colores */}
      <Card title="Colores / tokens">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {SWATCHES.map((s) => (
            <div key={s.name} className="text-center">
              <div className={`mx-auto mb-1 h-12 w-full rounded-lg ${s.cls}`} />
              <span className="text-xs text-muted">{s.name}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Tipografía */}
      <Card title="Tipografía">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Título H1 — 2xl bold</h1>
          <h2 className="text-lg font-semibold">Subtítulo H2 — lg semibold</h2>
          <p className="text-sm">Cuerpo — text-sm. El texto base de tablas, formularios y contenido.</p>
          <p className="text-sm text-muted">Texto secundario — text-muted, para pistas y metadatos.</p>
          <p className="text-xs text-muted">Caption — text-xs text-muted.</p>
        </div>
      </Card>

      {/* Botones */}
      <Card title="Botones" subtitle="variant: primary · secondary · danger · ghost">
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Deshabilitado</Button>
          <Button>
            <Plus size={16} /> Con ícono
          </Button>
        </div>
      </Card>

      {/* Badges */}
      <Card title="Badges" subtitle="tone: default · success · warning · danger · muted · accent">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge tone="success">Activo</Badge>
          <Badge tone="warning">Por vencer</Badge>
          <Badge tone="danger">Vencido</Badge>
          <Badge tone="muted">Inactivo</Badge>
          <Badge tone="accent">Nuevo</Badge>
        </div>
      </Card>

      {/* Alertas */}
      <Card title="Alertas / callouts" subtitle="tone: info · success · warning · danger">
        <div className="space-y-2">
          <Alert tone="info" title="Informativo">Mensaje neutral para contexto o ayuda.</Alert>
          <Alert tone="success" title="Éxito">La operación se completó correctamente.</Alert>
          <Alert tone="warning" title="Atención">Revisa la caducidad de los perecederos.</Alert>
          <Alert tone="danger" title="Error">Existencia insuficiente para la línea 2.</Alert>
        </div>
      </Card>

      {/* Formulario */}
      <Card title="Formulario" subtitle="Field, Input, Select, Textarea, Switch">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Campo de texto" required>
            <Input placeholder="Escribe algo…" />
          </Field>
          <Field label="Selector" hint="dropdown con el diseño de la app (no el nativo del SO)">
            <Select value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="a">Opción A</option>
              <option value="b">Opción B</option>
              <option value="c">Opción C</option>
              <option value="d" disabled>Opción D (no disponible)</option>
            </Select>
          </Field>
          <Field label="Número">
            <Input type="number" placeholder="0" />
          </Field>
          <Field label="Input deshabilitado">
            <Input value="No editable" disabled readOnly />
          </Field>
          <Field label="Selector deshabilitado" hint="tono gris suave indica que no se puede usar">
            <Select value="a" disabled onChange={() => {}}>
              <option value="a">No editable</option>
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Área de texto">
              <Textarea rows={2} placeholder="Descripción…" />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={sw} onChange={setSw} />
            <span className="text-sm">Switch ({sw ? "on" : "off"})</span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={chk} onChange={(e) => setChk(e.target.checked)} />
            <span>Checkbox ({chk ? "marcado" : "sin marcar"})</span>
          </label>
        </div>
      </Card>

      {/* Tabs */}
      <Card title="Tabs">
        <Tabs
          tabs={[
            { id: "a", label: "General", content: <p className="text-sm text-muted">Contenido de la pestaña General.</p> },
            { id: "b", label: "Fiscal", content: <p className="text-sm text-muted">Contenido de la pestaña Fiscal.</p> },
            { id: "c", label: "Historial", content: <p className="text-sm text-muted">Contenido de la pestaña Historial.</p> },
          ]}
        />
      </Card>

      {/* Feedback */}
      <Card title="Feedback" subtitle="Toast, Spinner, EmptyState">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => toast.success("Guardado correctamente")}>
            <Check size={16} /> Toast éxito
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Algo salió mal")}>Toast error</Button>
          <Button variant="secondary" onClick={() => toast.info("Información")}>Toast info</Button>
          <span className="inline-flex items-center gap-2 text-sm text-muted"><Spinner /> cargando…</span>
        </div>
        <div className="mt-4">
          <EmptyState title="Sin resultados" />
        </div>
      </Card>

      {/* Overlays */}
      <Card title="Overlays" subtitle="Modal, ConfirmDialog">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setModal(true)}>Abrir Modal</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <Trash2 size={16} /> Abrir Confirm
          </Button>
        </div>
      </Card>

      {/* Search box */}
      <Card title="Search box" subtitle="SearchBox (sencillo) · SearchSelect (búsqueda + dropdown)">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* 1) Sencillo */}
          <div>
            <h3 className="mb-1 text-sm font-semibold">1. Search box sencillo</h3>
            <p className="mb-2 text-xs text-muted">
              Ícono de lupa, botón para limpiar. Para filtrar listas o tablas en vivo.
            </p>
            <SearchBox value={busqueda} onChange={setBusqueda} placeholder="Buscar…" />
            <p className="mt-2 text-xs text-muted">
              Valor: <code className="rounded bg-surface-2 px-1">{busqueda || "—"}</code>
            </p>
          </div>

          {/* 2) Búsqueda + dropdown */}
          <div>
            <h3 className="mb-1 text-sm font-semibold">2. Search box + dropdown</h3>
            <p className="mb-2 text-xs text-muted">
              Combobox: escribe para filtrar (sin acentos), navega con ↑/↓, Enter selecciona.
            </p>
            <SearchSelect
              options={UNIDADES_SAT}
              value={unidadSat}
              onSelect={(o) => setUnidadSat(o?.value ?? null)}
              placeholder="Buscar unidad SAT…"
            />
            <p className="mt-2 text-xs text-muted">
              Selección: <code className="rounded bg-surface-2 px-1">{unidadSat ?? "—"}</code>
            </p>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card title="DataTable">
        <p className="mb-3 text-sm text-muted">
          <b>Buscar</b> filtra en todas las columnas (sin acentos, por palabras). Clic en el encabezado para
          ordenar (asc → desc → sin orden). Botón <b>Columnas</b> para mostrar/ocultar y reordenar arrastrando.
          Arrastra el <b>borde derecho</b> de un encabezado para el ancho (estilo Excel: la tabla se ensancha y
          aparece scroll, sin comprimir las demás). Botón <b>Excel</b> para descargar. Columna de <b>acciones</b>
          con su menú <b>⋮</b> para reordenar/ocultar íconos. Pie de tabla con <b>paginado</b>. Todo se recuerda por tabla.
        </p>
        <DataTable columns={cols} rows={DEMO_ROWS} empty="Sin datos" searchable searchPlaceholder="Buscar producto…" columnsMenu resizable exportable exportFilename="demo" storageKey="demo-sistema-diseno" paginated defaultPageSize={5} pageSizeOptions={[5, 10, 25, 50]} actions={rowActions} actionsMenu />
      </Card>

      {/* Tabla con filas expandibles */}
      <Card title="DataTableSmart">
        <p className="mb-3 text-sm text-muted">
          Misma <b>DataTable</b> con todas sus funciones activadas por defecto (buscar, ordenar, columnas,
          ancho estilo Excel, Excel, paginado) más <b>filas expandibles</b>: haz clic en una fila y se despliega
          (<i>slide-down</i>) un panel con su detalle. El detalle se puede cargar bajo demanda con
          <code className="mx-1 rounded bg-surface-2 px-1">onRowExpand</code>. La columna de <b>acciones</b> y su
          menú <b>⋮</b> vienen incluidos.
        </p>
        <DataTableSmart
          columns={cols}
          rows={DEMO_ROWS}
          empty="Sin datos"
          searchPlaceholder="Buscar producto…"
          exportFilename="demo-smart"
          storageKey="demo-smart-sistema-diseno"
          defaultPageSize={5}
          pageSizeOptions={[5, 10, 25, 50]}
          actions={rowActions}
          rowKey={(r) => r.id}
          renderExpanded={(r) => (
            <div className="rounded-xl border border-border bg-background p-4 text-sm">
              <div className="mb-2 font-medium">{r.nombre}</div>
              <div className="flex flex-wrap gap-4 text-muted">
                <div><span className="text-foreground">ID:</span> {r.id}</div>
                <div><span className="text-foreground">Estado:</span> <Badge tone={r.estado === "Activo" ? "success" : "muted"}>{r.estado}</Badge></div>
              </div>
              <p className="mt-2 text-muted">
                Este panel es el contenido de <code className="rounded bg-surface-2 px-1">renderExpanded</code>.
                Aquí iría el detalle de la fila (líneas, totales, etc.).
              </p>
            </div>
          )}
        />
      </Card>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Modal de ejemplo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={() => setModal(false)}>Aceptar</Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Cuerpo del modal. Se usa para formularios y confirmaciones detalladas. Cierra con Esc o el fondo.
        </p>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="¿Eliminar elemento?"
        message="Esta acción se puede revertir recreando el elemento."
        onConfirm={() => { setConfirm(false); toast.success("Eliminado"); }}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
