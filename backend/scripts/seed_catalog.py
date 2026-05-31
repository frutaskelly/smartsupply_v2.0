"""Seed a demo catalog for a tenant: esquemas de impuesto, categorías, un almacén,
55 productos (frutas/verduras, abarrotes, carnes, lácteos, embutidos, congelados,
botanas, bebidas, limpieza, cuidado personal, plásticos) e inventario inicial.

Ejercita el modelo completo: unidad base por recepción, presentaciones (simples y
ricas {factor, sat, estimado}), peso_variable (catch-weight), cadena fría,
caducidad/lote, contenido_litros, e IEPS cuota/tasa.

Idempotente: omite filas que ya existen (por código/SKU); solo crea inventario
para productos recién creados. Corre contra local o nube vía DATABASE_URL.

    python -m scripts.seed_catalog --slug frutas-kelly
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from decimal import Decimal

from app.core.db import SessionLocal
from app.core.rbac import tenant_session
from app.models import (
    Almacen,
    CategoriaProducto,
    EsquemaImpuesto,
    ListaPrecios,
    LoteInventario,
    Precio,
    Producto,
    Serie,
    Tenant,
)

# (codigo, nombre, iva, ieps_tasa, tipo_ieps, ieps_cuota)
ESQUEMAS = [
    ("ALIM-0", "Alimentos (tasa 0%)", 0, 0, "TASA", 0),
    ("GRAV-16", "General gravado 16%", 0.16, 0, "TASA", 0),
    ("BEB-AZUC", "Bebida saborizada (IVA 16% + IEPS cuota)", 0.16, 0, "CUOTA", 3.0818),
    ("BOTANA-8", "Botana/dulce (IVA 0% + IEPS 8%)", 0, 0.08, "TASA", 0),
]

# (codigo, nombre)
CATEGORIAS = [
    ("FYV", "Frutas y verduras"),
    ("ABA", "Abarrotes secos"),
    ("CAR", "Carnes y aves"),
    ("LAC", "Lácteos y huevo"),
    ("EMB", "Embutidos y refrigerados"),
    ("CON", "Congelados y pescados"),
    ("BOT", "Botanas, dulces y galletas"),
    ("BEB", "Bebidas"),
    ("LIM", "Limpieza del hogar"),
    ("CPE", "Cuidado personal e higiene"),
    ("PLA", "Desechables y plásticos"),
]

ALMACEN = ("BG-CENTRAL", "Bodega Central")

# Listas default (nivel de venta). UNICO es la base/pública del resolutor.
LISTAS = [("UNICO", "Precio único"), ("MENUDEO", "Menudeo"), ("MAYOREO", "Mayoreo")]
MARKUP_BASE = Decimal("1.30")   # precio público sembrado = costo × 1.30

# Series default de folios: (codigo, tipo, tipo_documento, nombre)
SERIES = [
    ("A", "FISCAL", "FACTURA", "Facturas"),
    ("NC", "FISCAL", "NOTA_CREDITO", "Notas de crédito"),
    ("R", "NO_FISCAL", "REMISION", "Remisiones"),
]


def P(sku, nombre, fam, esq, base, pres, clave, usat, costo, stock, *,
      pv=False, per=False, cold=False, lote=False, cad=None, litros=None, sinos=None):
    return dict(
        sku=sku, nombre=nombre, fam=fam, esq=esq, base=base, pres=pres,
        clave=clave, usat=usat, costo=Decimal(str(costo)), stock=Decimal(str(stock)),
        pv=pv, per=per, cold=cold, lote=lote, cad=cad, litros=litros, sinos=sinos or [],
    )


# Presentaciones ricas para productos que se facturan en una unidad distinta a la base.
LECH = {"PIEZA": {"factor": 1, "sat": "H87"}, "KILO": {"factor": 2, "sat": "KGM", "estimado": True}}
POLLO = {"PIEZA": {"factor": 1, "sat": "H87"}, "KILO": {"factor": 0.55, "sat": "KGM", "estimado": True}}

PRODUCTOS = [
    # ── Frutas y verduras (ALIM-0) ──
    P("10010001", "Jitomate saladette", "FYV", "ALIM-0", "KILO", {"KILO": 1, "CAJA": 22}, "50420000", "KGM", 12, 500, pv=True, per=True, sinos=["tomate saladette", "guaje"]),
    P("10010002", "Lechuga romana", "FYV", "ALIM-0", "PIEZA", LECH, "50430000", "H87", 9, 600, pv=True, per=True, sinos=["lechuga orejona"]),
    P("10010003", "Sandía", "FYV", "ALIM-0", "KILO", {"KILO": 1, "PIEZA": 8}, "50360000", "KGM", 6, 800, pv=True, per=True, sinos=["watermelon"]),
    P("10010004", "Plátano Tabasco", "FYV", "ALIM-0", "KILO", {"KILO": 1, "CAJA": 20}, "50320000", "KGM", 10, 400, pv=True, per=True, sinos=["banana"]),
    P("10010005", "Cebolla blanca", "FYV", "ALIM-0", "KILO", {"KILO": 1, "COSTAL": 25}, "50410000", "KGM", 14, 300, pv=True, per=True),
    # ── Abarrotes secos (ALIM-0) ──
    P("10020001", "Aceite Nutrioli 850 ml", "ABA", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50151513", "H87", 28, 240, lote=True, cad="2027-05-30", sinos=["nutrioli", "aceite vegetal"]),
    P("10020002", "Azúcar estándar 1 kg", "ABA", "ALIM-0", "PIEZA", {"PIEZA": 1, "BULTO": 25}, "50161500", "H87", 22, 300),
    P("10020003", "Frijol negro granel", "ABA", "ALIM-0", "KILO", {"KILO": 1, "BULTO": 25}, "50101700", "KGM", 24, 250, sinos=["frijol negro"]),
    P("10020004", "Arroz súper extra 1 kg", "ABA", "ALIM-0", "PIEZA", {"PIEZA": 1, "BULTO": 20}, "50101500", "H87", 18, 280),
    P("10020005", "Atún en agua 140 g", "ABA", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 48}, "50121500", "H87", 16, 480, lote=True, cad="2028-01-30"),
    # ── Carnes y aves (ALIM-0, cadena fría, peso variable) ──
    P("10030001", "Pechuga de pollo sin hueso", "CAR", "ALIM-0", "KILO", {"KILO": 1, "CAJA": 20}, "50111500", "KGM", 85, 180, pv=True, per=True, cold=True, lote=True, cad="2026-06-04"),
    P("10030002", "Pierna y muslo de pollo", "CAR", "ALIM-0", "KILO", {"KILO": 1, "CAJA": 20}, "50111500", "KGM", 62, 150, pv=True, per=True, cold=True, lote=True, cad="2026-06-04"),
    P("10030003", "Bistec de res", "CAR", "ALIM-0", "KILO", {"KILO": 1}, "50111500", "KGM", 145, 120, pv=True, per=True, cold=True, lote=True, cad="2026-06-06"),
    P("10030004", "Carne molida de res", "CAR", "ALIM-0", "KILO", {"KILO": 1}, "50111500", "KGM", 120, 100, pv=True, per=True, cold=True, lote=True, cad="2026-06-05"),
    P("10030005", "Pollo entero", "CAR", "ALIM-0", "PIEZA", POLLO, "50111500", "H87", 95, 200, pv=True, per=True, cold=True, cad="2026-06-03"),
    # ── Lácteos y huevo (ALIM-0) ──
    P("10040001", "Leche entera 1 L", "LAC", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50131800", "H87", 22, 360, per=True, cold=True, lote=True, cad="2026-06-20"),
    P("10040002", "Huevo blanco", "LAC", "ALIM-0", "KILO", {"KILO": 1, "PIEZA": 0.06, "CONO": 1.8}, "50131600", "KGM", 38, 150, sinos=["huevo"]),
    P("10040003", "Queso panela", "LAC", "ALIM-0", "KILO", {"KILO": 1, "PIEZA": 0.4}, "50131700", "KGM", 95, 60, pv=True, per=True, cold=True, cad="2026-06-12"),
    P("10040004", "Crema ácida 900 ml", "LAC", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50131700", "H87", 32, 120, per=True, cold=True, cad="2026-06-25"),
    P("10040005", "Yogurt natural 1 kg", "LAC", "ALIM-0", "PIEZA", {"PIEZA": 1}, "50131700", "H87", 28, 100, per=True, cold=True, cad="2026-06-22"),
    # ── Embutidos y refrigerados (ALIM-0) ──
    P("10050001", "Jamón de pierna", "EMB", "ALIM-0", "KILO", {"KILO": 1}, "50112000", "KGM", 90, 50, pv=True, per=True, cold=True, cad="2026-06-18"),
    P("10050002", "Salchicha viena", "EMB", "ALIM-0", "KILO", {"KILO": 1, "PAQUETE": 1}, "50112000", "KGM", 45, 80, per=True, cold=True, cad="2026-06-20"),
    P("10050003", "Tocino", "EMB", "ALIM-0", "KILO", {"KILO": 1}, "50112000", "KGM", 110, 40, pv=True, per=True, cold=True, cad="2026-06-19"),
    P("10050004", "Chorizo", "EMB", "ALIM-0", "KILO", {"KILO": 1}, "50112000", "KGM", 85, 45, per=True, cold=True, cad="2026-06-21"),
    P("10050005", "Queso amarillo rebanado", "EMB", "ALIM-0", "KILO", {"KILO": 1, "PAQUETE": 0.5}, "50131700", "KGM", 88, 50, pv=True, per=True, cold=True, cad="2026-07-01"),
    # ── Congelados y pescados (ALIM-0, congelado) ──
    P("10060001", "Filete de tilapia", "CON", "ALIM-0", "KILO", {"KILO": 1}, "50121700", "KGM", 95, 100, pv=True, cold=True, lote=True, cad="2026-11-30"),
    P("10060002", "Camarón mediano", "CON", "ALIM-0", "KILO", {"KILO": 1, "CAJA": 2}, "50121500", "KGM", 220, 60, pv=True, cold=True, cad="2026-11-30"),
    P("10060003", "Verdura mixta congelada 1 kg", "CON", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50450000", "H87", 30, 120, cold=True, cad="2027-05-30"),
    P("10060004", "Papa a la francesa 1 kg", "CON", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 10}, "50440000", "H87", 35, 100, cold=True, cad="2027-05-30"),
    P("10060005", "Nuggets de pollo 1 kg", "CON", "ALIM-0", "PIEZA", {"PIEZA": 1, "CAJA": 8}, "50111500", "H87", 70, 80, cold=True, cad="2027-02-28"),
    # ── Botanas, dulces y galletas (BOTANA-8: IEPS 8%) ──
    P("10070001", "Papas fritas 45 g", "BOT", "BOTANA-8", "PIEZA", {"PIEZA": 1, "CAJA": 24}, "50192100", "H87", 8, 600),
    P("10070002", "Galletas surtidas 1 kg", "BOT", "BOTANA-8", "PIEZA", {"PIEZA": 1, "CAJA": 6}, "50181900", "H87", 35, 90),
    P("10070003", "Chocolate de mesa", "BOT", "BOTANA-8", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50161800", "H87", 24, 120),
    P("10070004", "Paleta de caramelo", "BOT", "BOTANA-8", "PIEZA", {"PIEZA": 1, "BOLSA": 100}, "50161800", "H87", 1.5, 1000),
    P("10070005", "Cacahuate japonés granel", "BOT", "BOTANA-8", "KILO", {"KILO": 1}, "50101900", "KGM", 40, 50),
    # ── Bebidas (IEPS cuota / agua var / jugo 16%) ──
    P("10080001", "Coca-Cola 600 ml", "BEB", "BEB-AZUC", "PIEZA", {"PIEZA": 1, "PAQUETE": 12}, "50202306", "H87", 11, 480, litros=0.6, cad="2027-02-28"),
    P("10080002", "Sprite lata 355 ml", "BEB", "BEB-AZUC", "PIEZA", {"PIEZA": 1, "CAJA": 24}, "50202306", "H87", 9, 720, litros=0.355, cad="2027-02-28"),
    P("10080003", "Agua garrafón 20 L", "BEB", "ALIM-0", "PIEZA", {"PIEZA": 1}, "50202301", "H87", 18, 100, litros=20),
    P("10080004", "Agua embotellada 600 ml", "BEB", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 24}, "50202301", "H87", 4, 480, litros=0.6),
    P("10080005", "Jugo de naranja 1 L", "BEB", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "50202310", "H87", 16, 240, litros=1, cad="2026-08-30"),
    # ── Limpieza del hogar (GRAV-16) ──
    P("10090001", "Cloro 950 ml", "LIM", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "47131800", "H87", 12, 240),
    P("10090002", "Detergente en polvo 1 kg", "LIM", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 10}, "47131800", "H87", 28, 200),
    P("10090003", "Limpiador multiusos 1 L", "LIM", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "47131800", "H87", 18, 180),
    P("10090004", "Jabón de barra para ropa", "LIM", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 25}, "53131600", "H87", 9, 300),
    P("10090005", "Fibra esponja", "LIM", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 10}, "47121700", "H87", 5, 400),
    # ── Cuidado personal e higiene (GRAV-16) ──
    P("10100001", "Papel higiénico 4 rollos", "CPE", "GRAV-16", "PIEZA", {"PIEZA": 1, "PACA": 12}, "14111700", "H87", 22, 240),
    P("10100002", "Jabón de tocador 150 g", "CPE", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 48}, "53131600", "H87", 8, 480),
    P("10100003", "Shampoo 750 ml", "CPE", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 12}, "53131600", "H87", 35, 120),
    P("10100004", "Pasta dental 100 ml", "CPE", "GRAV-16", "PIEZA", {"PIEZA": 1, "CAJA": 24}, "53131500", "H87", 18, 240),
    P("10100005", "Pañal etapa M", "CPE", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 30}, "53102500", "H87", 4, 900),
    # ── Desechables y plásticos (GRAV-16) ──
    P("10110001", "Bolsa camiseta plástica", "PLA", "GRAV-16", "KILO", {"KILO": 1, "BULTO": 10}, "24121806", "KGM", 38, 80),
    P("10110002", "Vaso desechable 10 oz", "PLA", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 25, "CAJA": 1000}, "52151502", "H87", 0.6, 5000),
    P("10110003", "Charola foam #2", "PLA", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 500}, "24121800", "H87", 1.1, 4000),
    P("10110004", "Plato desechable #6", "PLA", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 50}, "52151500", "H87", 0.8, 3000),
    P("10110005", "Cuchara desechable", "PLA", "GRAV-16", "PIEZA", {"PIEZA": 1, "PAQUETE": 100}, "52151600", "H87", 0.3, 6000),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    args = ap.parse_args()

    with SessionLocal() as s:
        tenant = s.query(Tenant).filter(Tenant.slug == args.slug).one_or_none()
        if tenant is None:
            print(f"ERROR: tenant '{args.slug}' no existe"); sys.exit(1)
        tid = tenant.id
    print(f"Sembrando catálogo en tenant '{args.slug}' ({tid})")

    n = {"esq": 0, "cat": 0, "prod": 0, "lote": 0, "lista": 0, "precio": 0, "serie": 0}
    with tenant_session(tid) as db:
        # esquemas
        esq_id, esq_rate = {}, {}
        for codigo, nombre, iva, ieps, tipo, cuota in ESQUEMAS:
            e = db.query(EsquemaImpuesto).filter(EsquemaImpuesto.codigo == codigo).one_or_none()
            if e is None:
                e = EsquemaImpuesto(
                    tenant_id=tid, codigo=codigo, nombre=nombre,
                    iva_tasa=Decimal(str(iva)), ieps_tasa=Decimal(str(ieps)),
                    tipo_ieps=tipo, ieps_cuota=Decimal(str(cuota)),
                )
                db.add(e); db.flush(); n["esq"] += 1
            esq_id[codigo] = e.id
            esq_rate[codigo] = (Decimal(str(iva)), Decimal(str(ieps)))

        # categorías
        cat_id = {}
        for codigo, nombre in CATEGORIAS:
            c = db.query(CategoriaProducto).filter(CategoriaProducto.codigo == codigo).one_or_none()
            if c is None:
                c = CategoriaProducto(tenant_id=tid, codigo=codigo, nombre=nombre)
                db.add(c); db.flush(); n["cat"] += 1
            cat_id[codigo] = c.id

        # almacén
        alm = db.query(Almacen).filter(Almacen.codigo == ALMACEN[0]).one_or_none()
        if alm is None:
            alm = Almacen(tenant_id=tid, codigo=ALMACEN[0], nombre=ALMACEN[1])
            db.add(alm); db.flush()

        # listas de precios default (UNICO = base/público del resolutor)
        lista_id = {}
        for codigo, nombre in LISTAS:
            l = db.query(ListaPrecios).filter(ListaPrecios.codigo == codigo).one_or_none()
            if l is None:
                l = ListaPrecios(tenant_id=tid, codigo=codigo, nombre=nombre)
                db.add(l); db.flush(); n["lista"] += 1
            lista_id[codigo] = l.id

        # series default de folios (A factura, NC nota de crédito, R remisión)
        for codigo, tipo, tipo_doc, nombre in SERIES:
            s = db.query(Serie).filter(Serie.codigo == codigo, Serie.tipo_documento == tipo_doc).one_or_none()
            if s is None:
                db.add(Serie(tenant_id=tid, codigo=codigo, tipo=tipo, tipo_documento=tipo_doc, nombre=nombre))
                n["serie"] += 1

        # productos + inventario + precio público base (lista UNICO)
        for p in PRODUCTOS:
            prod = db.query(Producto).filter(Producto.sku == p["sku"]).one_or_none()
            if prod is None:
                iva, ieps = esq_rate[p["esq"]]
                prod = Producto(
                    tenant_id=tid, sku=p["sku"], nombre=p["nombre"],
                    categoria_id=cat_id[p["fam"]], esquema_impuesto_id=esq_id[p["esq"]],
                    clave_sat=p["clave"], unidad_sat=p["usat"], objeto_imp="02",
                    iva_tasa=iva, ieps_tasa=ieps,
                    unidad_base=p["base"], presentaciones=p["pres"], presentacion_default=p["base"],
                    peso_variable=p["pv"], contenido_litros=(Decimal(str(p["litros"])) if p["litros"] is not None else None),
                    perecedero=p["per"], cold_chain=p["cold"],
                    requiere_lote=p["lote"], requiere_caducidad=bool(p["cad"]),
                    sinonimos=p["sinos"], activo=True,
                )
                db.add(prod); db.flush(); n["prod"] += 1
                cad = date.fromisoformat(p["cad"]) if p["cad"] else None
                db.add(LoteInventario(
                    tenant_id=tid, producto_id=prod.id, almacen_id=alm.id,
                    numero_lote=None, fecha_caducidad=cad,
                    cantidad_inicial=p["stock"], cantidad_disponible=p["stock"],
                    cantidad_reservada=Decimal("0"), costo_unitario=p["costo"],
                ))
                n["lote"] += 1

            existe = (
                db.query(Precio).filter(
                    Precio.lista_id == lista_id["UNICO"],
                    Precio.producto_id == prod.id,
                    Precio.presentacion == p["base"],
                ).first()
            )
            if existe is None:
                db.add(Precio(
                    tenant_id=tid, lista_id=lista_id["UNICO"], producto_id=prod.id,
                    presentacion=p["base"],
                    precio_unitario=(p["costo"] * MARKUP_BASE).quantize(Decimal("0.01")),
                    cantidad_minima=1,
                ))
                n["precio"] += 1

    print(f"  esquemas={n['esq']} categorías={n['cat']} listas={n['lista']} series={n['serie']} "
          f"productos={n['prod']} lotes={n['lote']} precios={n['precio']}")
    print("Listo (idempotente — vuelve a correr sin duplicar).")


if __name__ == "__main__":
    main()
