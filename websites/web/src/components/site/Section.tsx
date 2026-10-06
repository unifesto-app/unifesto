import type { ComponentPropsWithRef, ReactNode } from "react";

type Surface = "night" | "night-2" | "paper" | "blue";

/* A full-bleed band of one surface. Light surfaces (paper, blue) set
   data-surface="light" so floating chrome (navbar, support) adapts its tint and text,
   and arrive as a settling sheet unless `flat` is set. */
export default function Section({
  surface = "night",
  flat = false,
  width = "wide",
  pad = "default",
  className = "",
  innerClassName = "",
  children,
  ...rest
}: {
  surface?: Surface;
  flat?: boolean;
  width?: "wide" | "text" | "mid";
  pad?: "default" | "tight" | "none";
  innerClassName?: string;
  children: ReactNode;
} & ComponentPropsWithRef<"section">) {
  const light = surface === "paper" || surface === "blue";
  const max = width === "text" ? "max-w-3xl" : width === "mid" ? "max-w-5xl" : "max-w-7xl";
  const py = pad === "none" ? "" : pad === "tight" ? "py-14 md:py-20" : "py-20 md:py-32";
  return (
    <section
      data-surface={light ? "light" : undefined}
      className={`surface-${surface} relative ${light && !flat ? "sheet" : ""} ${className}`}
      {...rest}
    >
      <div className={`relative mx-auto w-full ${max} px-5 sm:px-8 ${py} ${innerClassName}`}>{children}</div>
    </section>
  );
}
