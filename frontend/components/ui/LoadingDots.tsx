"use client";

import { useEffect, useState } from "react";

// Puntos suspensivos animados para indicar "trabajando" (ancho fijo para que
// el botón no salte). Cicla "" → "." → ".." → "..." cada 400 ms.
export function LoadingDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x % 3) + 1), 400);
    return () => clearInterval(id);
  }, []);
  return <span className="inline-block w-4 text-left">{".".repeat(n)}</span>;
}
