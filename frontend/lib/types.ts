// API response types (numeric/Decimal fields arrive as strings over JSON).

export type Categoria = {
  id: string;
  tenant_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  color?: string | null;
  orden: number;
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
  presentaciones: Record<string, number>;
  presentacion_default?: string | null;
  unidad_entrada?: string | null;
  unidad_salida?: string | null;
  perecedero: boolean;
  cold_chain: boolean;
  requiere_lote: boolean;
  requiere_caducidad: boolean;
  vida_util_dias?: number | null;
  costo_promedio: string;
  sinonimos: string[];
  activo: boolean;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
