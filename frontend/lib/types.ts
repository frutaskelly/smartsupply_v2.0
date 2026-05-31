// API response types (numeric/Decimal fields arrive as strings over JSON).

// ── IAM (roles, permissions, memberships) ──
export type Permission = {
  id: string;
  recurso: string;
  accion: string;
  vertical?: string | null;
  descripcion?: string | null;
};

export type Role = {
  id: string;
  tenant_id?: string | null;
  nombre: string;
  vertical?: string | null;
  descripcion?: string | null;
  es_preset: boolean;
  created_at: string;
  updated_at: string;
};

export type RoleDetail = Role & { permissions: string[] };

export type Membership = {
  id: string;
  tenant_id: string;
  user_id: string;
  role_id: string;
  active: boolean;
  acceso_todas_sucursales: boolean;
  created_at: string;
  updated_at: string;
  user_email?: string | null;
  user_full_name?: string | null;
  role_nombre?: string | null;
};

export type Categoria = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type EsquemaImpuesto = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  iva_tasa: string;
  ieps_tasa: string;
  iva_exento: boolean;
  retencion_iva_tasa: string;
  retencion_isr_tasa: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type ListaPrecios = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  status: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  moneda: string;
  notas?: string | null;
  created_at: string;
  updated_at: string;
};

export type Precio = {
  id: string;
  tenant_id: string;
  lista_id: string;
  producto_id: string;
  presentacion: string;
  precio_unitario: string;
  cantidad_minima: number;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
};

export type Sucursal = {
  id: string;
  tenant_id: string;
  cliente_id: string;
  codigo?: string | null;
  nombre: string;
  lista_precios_id?: string | null;
  domicilio: Record<string, unknown>;
  contacto?: string | null;
  telefono?: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type PrecioOverride = {
  id: string;
  tenant_id: string;
  cliente_id?: string | null;
  sucursal_id?: string | null;
  producto_id: string;
  presentacion: string;
  precio_unitario: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  created_at: string;
  updated_at: string;
};

export type Cotizacion = {
  producto_id: string;
  presentacion: string;
  cantidad: string;
  precio?: string | null;
  origen?: string | null;
  lista_id?: string | null;
};

export type Cliente = {
  id: string;
  tenant_id: string;
  codigo?: string | null;
  tipo: string;
  status: string;
  legal_name: string;
  rfc: string;
  regimen_fiscal?: string | null;
  uso_cfdi_default?: string | null;
  forma_pago_default?: string | null;
  metodo_pago_default?: string | null;
  domicilio_fiscal: Record<string, unknown>;
  lista_precios_id?: string | null;
  condiciones_pago?: string | null;
  limite_credito: string;
  dias_credito: number;
  descuento_default: string;
  config_addenda: Record<string, unknown>;
  saldo_actual: string;
  ventas_ytd: string;
  ultima_venta_at?: string | null;
  ultimo_pago_at?: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ExistenciaRow = {
  producto_id: string;
  producto_sku: string | null;
  producto_nombre: string | null;
  almacen_id: string;
  almacen_nombre: string | null;
  disponible: string;
  reservada: string;
  costo_promedio: string;
  valor: string;
};

export type Movimiento = {
  id: string;
  tenant_id: string;
  tipo: string;
  fecha: string;
  lote_id: string;
  cantidad: string;
  costo_unitario?: string | null;
  ref_tipo?: string | null;
  ref_id?: string | null;
  motivo?: string | null;
  notas?: string | null;
  created_by?: string | null;
  created_at: string;
};

export type Proveedor = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  rfc?: string | null;
  contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  categorias: string[];
  condiciones_pago?: string | null;
  activo: boolean;
  notas?: string | null;
  created_at: string;
  updated_at: string;
};

export type Almacen = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  calle?: string | null;
  colonia?: string | null;
  cp?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  es_default: boolean;
  created_at: string;
  updated_at: string;
};

export type LineaOrdenCompra = {
  id: string;
  producto_id: string;
  cantidad_solicitada: string;
  cantidad_recibida: string;
  presentacion?: string | null;
  precio_unitario: string;
  importe: string;
  notas?: string | null;
};

export type OrdenCompra = {
  id: string;
  tenant_id: string;
  folio?: string | null;
  proveedor_id: string;
  almacen_destino_id?: string | null;
  fecha: string;
  fecha_entrega_esperada?: string | null;
  fecha_recibida?: string | null;
  estado: string;
  subtotal: string;
  iva_total: string;
  total_estimado: string;
  total_recibido: string;
  notas?: string | null;
  created_at: string;
  updated_at: string;
  lineas?: LineaOrdenCompra[];
};

export type Conversion = {
  id: string;
  tenant_id: string;
  producto_catalogado_id: string;
  producto_no_catalogado_id: string;
  factor: string;
  merma_pct: string;
  precio_no_cat?: string | null;
  mezcla_grupo_id?: string | null;
  mezcla_proporcion?: string | null;
  prioridad: number;
  requiere_aprobacion: boolean;
  activo: boolean;
  notas?: string | null;
  created_at: string;
  updated_at: string;
};

export type Producto = {
  id: string;
  tenant_id: string;
  sku: string;
  nombre: string;
  descripcion?: string | null;
  categoria_id?: string | null;
  esquema_impuesto_id?: string | null;
  clave_sat: string;
  unidad_sat: string;
  objeto_imp: string;
  iva_tasa: string;
  ieps_tasa: string;
  unidad_base: string;
  presentaciones: Record<string, number>;
  presentacion_default?: string | null;
  unidad_entrada?: string | null;
  unidad_salida?: string | null;
  perecedero: boolean;
  cold_chain: boolean;
  requiere_lote: boolean;
  requiere_caducidad: boolean;
  vida_util_dias?: number | null;
  sinonimos: string[];
  activo: boolean;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
