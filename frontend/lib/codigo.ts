/**
 * Genera el código de una categoría a partir de su nombre.
 *
 * Espejo de la regla del backend (`app/services/categoria_codigo.py`): quita
 * acentos, deja sólo A-Z/0-9 en mayúsculas y toma los primeros 5 caracteres.
 * Es sólo una vista previa: el backend es la fuente de verdad y resuelve los
 * choques con un sufijo numérico.
 */
export function categoriaCodigo(nombre: string, length = 5): string {
  const cleaned = (nombre ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // quita diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, length) || "CAT";
}
