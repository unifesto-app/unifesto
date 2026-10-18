"use client";

import { useEffect, useState } from "react";
import { getEventById } from "@/lib/api/events-api";
import { getSpaceUsage } from "@/lib/api/subscriptions-api";
import {
  exportRegistrations,
  EXPORT_EXTENSION,
  type EventExportType,
  type ExportFormat,
} from "@/lib/api/registrations-api";
import { ExportMenu } from "./ExportMenu";

/**
 * ExportMenu wired to the event export route: resolves the plan gate from the
 * event's space, downloads the file, and shows the server's message on failure.
 */
export function EventExportMenu({
  eventId,
  type,
  disabled,
}: {
  eventId: string;
  type: EventExportType;
  disabled?: boolean;
}) {
  const [slug, setSlug] = useState(eventId);
  const [canExport, setCanExport] = useState<boolean | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: event } = await getEventById(eventId);
      if (!event || !active) return;
      setSlug(event.slug);
      // Same flag the backend enforces with (getEffectiveLimits → hasBulkExport).
      const { data: usage } = await getSpaceUsage(event.spaceId);
      if (usage && active) setCanExport(usage.features.hasBulkExport);
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  const onExport = async (format: ExportFormat) => {
    setExporting(true);
    const { data, error } = await exportRegistrations(eventId, format, type);
    setExporting(false);
    if (error) return alert(error.message);
    if (!data) return;
    const url = URL.createObjectURL(data);
    Object.assign(document.createElement("a"), {
      href: url,
      download: `${slug}-${type}.${EXPORT_EXTENSION[format]}`,
    }).click();
    URL.revokeObjectURL(url);
  };

  return <ExportMenu onExport={onExport} exporting={exporting} disabled={disabled} canExport={canExport} />;
}
