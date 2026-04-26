/**
 * Helpers internes pour mappers.
 */

/**
 * Convertit snake_case → camelCase pour les clés d'un objet plat.
 * À utiliser uniquement pour des objets sans nested complexe.
 */
export function snakeToCamel<T extends Record<string, unknown>>(
  obj: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
    result[camelKey] = value;
  }
  return result as T;
}
