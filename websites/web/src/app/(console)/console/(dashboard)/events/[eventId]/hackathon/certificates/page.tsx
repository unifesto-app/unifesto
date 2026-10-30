"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Certificate, CheckCircle, Hourglass, WarningCircle } from "@unifesto/unicon/react";
import { Button } from "@/console/components/ui/button";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { Chips, Field, FormCard, HackPage, useResult } from "@/console/components/hackathon/HackParts";
import { getHackathonCertificates, issueHackathonCertificates } from "@/console/lib/api/hackathon";
import { formatWhen } from "@/console/lib/hackathon";

type Audience = "PARTICIPANTS" | "WINNERS";

/**
 * Hackathon certificates (port of HackathonCertificatesScreen): issue one of
 * the event's certificate templates to every team member, or to the winners.
 * Custom text in the template can print {teamName}, {teamCode} and {awardTitle}.
 */
export default function HackathonCertificatesPage() {
  const eventId = useParams().eventId as string;
  const fetcher = useCallback(() => getHackathonCertificates(eventId), [eventId]);
  const { data, setData, error, setError, reload } = useResult(fetcher);
  const [picked, setPicked] = useState("");
  const [audience, setAudience] = useState<Audience>("PARTICIPANTS");
  const [issuing, setIssuing] = useState(false);

  // While a run is queued or rendering, check on it every few seconds.
  const running = data?.batches.some((b) => b.status === "QUEUED" || b.status === "PROCESSING") ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void reload(), 3_000);
    return () => clearInterval(t);
  }, [running, reload]);

  if (!data) return <HackPage eventId={eventId} title="Certificates" error={error} ready={false} />;

  const templateId = picked || data.templates[0]?.id || "";
  const template = data.templates.find((t) => t.id === templateId) ?? null;
  const certsHref = `/console/events/${eventId}/certificates`;
  const blocked = !data.planAllowed
    ? "Certificates aren't included in this space's plan."
    : !data.window.isOpen
      ? `Issuing closed on ${formatWhen(data.window.closesAt)}.`
      : !data.templates.length
        ? "Design a certificate template on the event's Certificates page first."
        : audience === "WINNERS" && !data.winners.length
          ? "Publish winners first."
          : audience === "PARTICIPANTS" && !data.participants.teams
            ? "Import teams first."
            : null;

  const issue = async () => {
    if (!template) return;
    const who =
      audience === "PARTICIPANTS"
        ? `${data.participants.people} ${data.participants.people === 1 ? "person" : "people"} in ${data.participants.teams} team${data.participants.teams === 1 ? "" : "s"}`
        : `the winning teams (${data.winners.length} award${data.winners.length === 1 ? "" : "s"})`;
    const warn =
      audience === "WINNERS" && !template.usesAward ? "\n\nThis template doesn't print {awardTitle}, so winners' certificates won't name the award." : "";
    if (!window.confirm(`Issue "${template.name}"? Certificates go to ${who} and are emailed. Anyone who already has this certificate is skipped.${warn}`)) return;
    setIssuing(true);
    const res = await issueHackathonCertificates(eventId, template.id, audience);
    setIssuing(false);
    if (!res.ok) return setError(res.message);
    setData(res.data);
  };

  return (
    <HackPage
      eventId={eventId}
      title="Certificates"
      subtitle="Each person gets their own certificate by email, and finds it under Certificates in the app."
      error={error}
      ready
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormCard>
          <Field
            label="Who gets them"
            hint={
              audience === "WINNERS" && data.winners.length
                ? data.winners.map((w) => `${w.title}: ${w.team.teamCode ?? ""} ${w.team.name}`.trim()).join(" · ")
                : undefined
            }
          >
            <Chips
              options={[
                { value: "PARTICIPANTS" as const, label: `Every team member (${data.participants.people})` },
                { value: "WINNERS" as const, label: `Winners (${data.winners.length})` },
              ]}
              value={audience}
              onChange={setAudience}
            />
          </Field>
          <Field
            label="Template"
            hint={
              <>
                {template && (template.usesTeam || template.usesAward)
                  ? `Prints ${[template.usesTeam ? "the team" : null, template.usesAward ? "the award" : null].filter(Boolean).join(" and ")}. `
                  : ""}
                To print the team or award, add custom text like &ldquo;Team {"{teamName}"} ({"{teamCode}"})&rdquo; or &ldquo;{"{awardTitle}"}&rdquo; on the{" "}
                <Link href={certsHref} className="underline">
                  Certificates page
                </Link>
                .
              </>
            }
          >
            {data.templates.length > 0 && (
              <Chips options={data.templates.map((t) => ({ value: t.id, label: t.name }))} value={templateId} onChange={setPicked} />
            )}
          </Field>
          {blocked && <p className="text-sm text-warning">{blocked}</p>}
          {data.canIssue ? (
            <Button onClick={issue} disabled={issuing || !!blocked || !template}>
              <Certificate className="h-4 w-4" weight="fill" />
              {issuing ? "Issuing…" : audience === "WINNERS" ? "Issue winner certificates" : "Issue participant certificates"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Only the Curator or a Space Admin can issue certificates.</p>
          )}
          {data.window.isOpen && <p className="text-xs text-muted-foreground">You can issue certificates until {formatWhen(data.window.closesAt)}.</p>}
        </FormCard>

        {data.batches.length > 0 && (
          <ListGroup title="Issued">
            {data.batches.map((b) => (
              <ListRow
                key={b.id}
                icon={
                  b.status === "COMPLETED" ? (
                    <CheckCircle className={b.failed ? "h-5 w-5 text-warning" : "h-5 w-5 text-success"} weight="fill" />
                  ) : b.status === "FAILED" ? (
                    <WarningCircle className="h-5 w-5 text-destructive" weight="fill" />
                  ) : (
                    <Hourglass className="h-5 w-5 text-muted-foreground" weight="fill" />
                  )
                }
                label={b.label}
                sublabel={formatWhen(b.createdAt)}
                value={
                  b.status === "COMPLETED"
                    ? `${b.issued + b.reactivated} issued${b.skipped ? ` · ${b.skipped} already had one` : ""}${b.failed ? ` · ${b.failed} failed` : ""}`
                    : b.status === "FAILED"
                      ? "Failed"
                      : b.status === "PROCESSING"
                        ? "Issuing…"
                        : "Queued"
                }
              />
            ))}
          </ListGroup>
        )}
      </div>
    </HackPage>
  );
}
