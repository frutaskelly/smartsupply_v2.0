"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, apiFetch } from "./api";

/** A page of results from the backend (matches the FastAPI `Page` schema). */
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

/** Fetch a resource on mount + whenever `path` changes. `null` path = skip. */
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<T>(path));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al cargar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

/** Imperative create/update/delete helper. Throws on error so callers can toast. */
export function useMutation() {
  const [loading, setLoading] = useState(false);

  const send = useCallback(
    async <T>(path: string, method: string, body?: unknown): Promise<T> => {
      setLoading(true);
      try {
        return await apiFetch<T>(path, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    post: <T,>(path: string, body?: unknown) => send<T>(path, "POST", body),
    patch: <T,>(path: string, body?: unknown) => send<T>(path, "PATCH", body),
    del: <T,>(path: string) => send<T>(path, "DELETE"),
  };
}
