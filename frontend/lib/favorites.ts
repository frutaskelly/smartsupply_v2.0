"use client";

import { useCallback, useEffect, useState } from "react";

/** Favoritos del sidebar: lista ordenada de `href` que el usuario fija arriba.
 * Persistido en localStorage por usuario (mismo patrón que DataTable: `fav:{userId}`).
 * El orden refleja el orden en que se agregaron. */
function storageKey(userId: string) {
  return `fav:${userId}`;
}

function read(userId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // ignora storage corrupto
  }
}

export function useFavorites(userId: string) {
  const [favorites, setFavorites] = useState<string[]>([]);
  // Evita hidratar con valores de localStorage en SSR (mismatch).
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFavorites(read(userId));
    setHydrated(true);
  }, [userId]);

  // Sincroniza entre pestañas.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === storageKey(userId)) setFavorites(read(userId));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const persist = useCallback(
    (next: string[]) => {
      setFavorites(next);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        /* noop */
      }
    },
    [userId]
  );

  const toggle = useCallback(
    (href: string) => {
      setFavorites((prev) => {
        const next = prev.includes(href)
          ? prev.filter((h) => h !== href)
          : [...prev, href];
        try {
          localStorage.setItem(storageKey(userId), JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    },
    [userId]
  );

  const isFavorite = useCallback(
    (href: string) => favorites.includes(href),
    [favorites]
  );

  return { favorites, hydrated, toggle, isFavorite, persist };
}
