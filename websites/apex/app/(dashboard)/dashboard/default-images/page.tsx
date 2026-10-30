"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { ImageUploadCard } from "@/components/shared/ImageUploadCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import {
  addDefaultImage,
  deleteDefaultImage,
  getDefaultImages,
  type DefaultImageKind,
  type DefaultImageRow,
} from "@/lib/api/platform-tools-api";

const KINDS: { kind: DefaultImageKind; title: string; hint: string; aspect: number; tile: string }[] = [
  { kind: "BANNER", title: "Event banners", hint: "4:3. Shown on events without a cover.", aspect: 4 / 3, tile: "aspect-[4/3] rounded-lg" },
  { kind: "LOGO", title: "Space logos", hint: "1:1. Shown for spaces without a logo.", aspect: 1, tile: "aspect-square rounded-full" },
];

/**
 * Apex › Default images (web port of the mobile screen): the stand-in banners
 * and logos the apps show instead of a flat colour when an event or space has
 * none. Each event/space always gets the same one, picked by its id.
 */
export default function DefaultImagesPage() {
  const [rows, setRows] = useState<DefaultImageRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(
    () =>
      getDefaultImages().then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data ?? []);
      }),
    []
  );

  useEffect(() => {
    void getDefaultImages().then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
    });
  }, []);

  const remove = async (row: DefaultImageRow) => {
    if (!window.confirm("Remove this image? Events or spaces using it get another default.")) return;
    setBusy(row.id);
    const { error } = await deleteDefaultImage(row.id);
    setBusy(null);
    if (error) setError(error.message);
    await load();
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Default images" subtitle="Stand-in banners and logos for events and spaces without their own." />
      {error && <ErrorNotice message={error} />}

      {KINDS.map(({ kind, title, hint, aspect, tile }) => {
        const list = rows?.filter((r) => r.kind === kind) ?? [];
        return (
          <section key={kind} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground">
                {hint} {rows && (list.length === 0 ? "None yet, so the apps show a colour." : `${list.length} in rotation.`)}
              </p>
            </div>
            <div className={cn("grid gap-4", kind === "LOGO" ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4")}>
              {!rows
                ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className={tile} />)
                : list.map((r) => (
                    <div key={r.id} className={cn("group relative overflow-hidden bg-muted", tile, busy === r.id && "opacity-40")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.url} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => void remove(r)}
                        disabled={busy === r.id}
                        aria-label={`Remove this ${kind === "LOGO" ? "logo" : "banner"}`}
                        className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
            </div>
            <div className="max-w-sm">
              <ImageUploadCard
                title={`Add ${kind === "LOGO" ? "a logo" : "a banner"}`}
                imageUrl={null}
                cropAspect={aspect}
                aspectClassName={kind === "LOGO" ? "aspect-square" : "aspect-[4/3]"}
                maxSizeMb={5}
                onUpload={async (file) => {
                  const { data, error } = await addDefaultImage(kind, file);
                  if (data) await load();
                  return { url: null, error: error?.message ?? null };
                }}
              />
            </div>
          </section>
        );
      })}
    </div>
  );
}
