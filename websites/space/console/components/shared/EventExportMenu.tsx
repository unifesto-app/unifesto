"use client";

import { useEffect, useState } from "react";
import { getEventById } from "@/console/lib/api/events-api";
import { useAccess } from "@/console/lib/context/SessionContext";
import {
  exportRegistrations,
  EXPORT_EXTENSION,
  type EventExportType,
  type ExportFormat,
} from "@/console/lib/api/registrations-api";
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
  // Same flag the backend enforces with; `undefined` until access loads.
  const { access, hasFeature } = useAccess(eventId);
  const canExport = access ? hasFeature("hasBulkExport") : undefined;
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: event } = await getEventById(eventId);
      if (!event || !active) return;
      setSlug(event.slug);
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
