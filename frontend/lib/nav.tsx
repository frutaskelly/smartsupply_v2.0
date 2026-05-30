import {
  Boxes,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Percent,
  Repeat,
  Shield,
  ShoppingCart,
  Tag,
  Truck,
  UserCog,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; perm?: string; icon: LucideIcon };
export type NavSection = { section: string; items: NavItem[] };

/** Sidebar model. Each item is shown only if the user holds `perm` (or is OWNER).
 * `perm` values are the `menu:*` permissions seeded in the backend catalog. */
export const NAV: NavSection[] = [
  {
    section: "General",
    items: [{ label: "Dashboard", href: "/dashboard", perm: "menu:dashboard", icon: LayoutDashboard }],
  },
  {
    section: "Catálogo",
    items: [
      { label: "Productos", href: "/productos", perm: "menu:productos", icon: Package },
      { label: "Categorías", href: "/categorias", perm: "menu:productos.categorias", icon: FolderTree },
      { label: "Esquemas de impuesto", href: "/esquemas-impuesto", perm: "menu:esquemas_impuesto", icon: Percent },
      { label: "Clientes", href: "/clientes", perm: "menu:clientes", icon: Users },
      { label: "Listas de precios", href: "/listas-precios", perm: "menu:listas_precios", icon: Tag },
    ],
  },
  {
    section: "Operaciones",
    items: [
      { label: "Inventario", href: "/inventario", perm: "menu:inventario", icon: Boxes },
      { label: "Almacenes", href: "/almacenes", perm: "menu:inventario", icon: Warehouse },
      { label: "Compras", href: "/compras", perm: "menu:compras", icon: ShoppingCart },
      { label: "Proveedores", href: "/proveedores", perm: "menu:compras", icon: Truck },
      { label: "Remisiones", href: "/remisiones", perm: "menu:remisiones", icon: FileText },
      { label: "Conversiones", href: "/conversiones", perm: "menu:conversiones", icon: Repeat },
    ],
  },
  {
    section: "Ajustes",
    items: [
      { label: "Usuarios", href: "/ajustes/usuarios", perm: "menu:ajustes.usuarios", icon: UserCog },
      { label: "Roles", href: "/ajustes/roles", perm: "menu:ajustes.roles", icon: Shield },
    ],
  },
];
