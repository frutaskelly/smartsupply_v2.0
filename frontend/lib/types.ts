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
