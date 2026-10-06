"use client";

import { useEffect, useRef, useState } from "react";

/* Clear glass has no colour of its own, so whatever floats over the page
   (navbar, support bubble) needs to know if the section under it is light.
   Sections opt in with data-surface="light"; everything else is dark. */
export function useLightSurfaceAt(getPoint: () => [number, number]) {
  const [light, setLight] = useState(false);
  const pointRef = useRef(getPoint);
  useEffect(() => {
    pointRef.current = getPoint;
  });

  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const [x, y] = pointRef.current();
      const section = document
        .elementsFromPoint(x, y)
        .map((el) => el.closest("section"))
        .find(Boolean);
      setLight(section?.dataset.surface === "light");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return light;
}
