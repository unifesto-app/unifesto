"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppleLogo, EnvelopeSimple, GoogleLogo, Phone } from "@unifesto/unicon/react";
import { getIdentities, makePrimary, removeIdentity, signOutEverywhere, type Identity } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { signOut } from "@/console/lib/utils/auth";
import { Button } from "@/console/components/ui/button";
import { useAccount } from "../AccountShell";
import DeleteAccount from "../DeleteAccount";
import Section from "../Section";

const PROVIDER = {
  EMAIL: { label: "Email", Icon: EnvelopeSimple },
  GOOGLE: { label: "Google", Icon: GoogleLogo },
  APPLE: { label: "Apple", Icon: AppleLogo },
  PHONE: { label: "Phone", Icon: Phone },
} as const;

/** "+919876543210" → "+91 98765 43210". Accounts made by Google or Apple carry a "+0…" stand-in. */
const phone = (n: string) => {
  if (!n || n.startsWith("+0")) return "Not set";
  const m = n.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : n;
};

/** One row per address: Google and email-code sign-ins on the same email merge, as in the app. */
function byEmail(ids: Identity[]) {
  const groups: { email: string | null; ids: Identity[] }[] = [];
  for (const i of ids) {
    const g = i.email ? groups.find((x) => x.email === i.email) : undefined;
    if (g) g.ids.push(i);
    else groups.push({ email: i.email, ids: [i] });
  }
  return groups;
}

/** Security (the app's Account settings; the URL keeps its old name): my phone, how I sign in, signing out everywhere, and deleting my account. */
export default function SignInPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { me } = useAccount();
  const [ids, setIds] = useState<Identity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => getIdentities(token).then(setIds, (e) => setError(e.message));
  useEffect(() => {
    if (token) void load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setSure(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const everywhere = async () => {
    setBusy(true);
    setError("");
    try {
      await signOutEverywhere(token);
      // Both sessions here too: this one and any old space-app cookie.
      await signOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign out everywhere.");
      setBusy(false);
    }
  };

  const groups = ids ? byEmail(ids) : [];

  return (
    <div>
      <Section title="Mobile number" description="Organisers reach me here about my tickets.">
        <div>
          <p className="text-sm font-medium tabular-nums text-foreground">{phone(me.mobileNumber)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            To change it,{" "}
            <Link href="/help/contact" className="text-foreground underline underline-offset-4">
              contact support
            </Link>
            .
          </p>
        </div>
      </Section>

      <Section title="Sign-in methods" description="How I sign in, and which address gets my emails.">
        {!ids ? (
          <p className={`text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || "Loading…"}</p>
        ) : (
          <ul className="-my-4 divide-y divide-border">
            {groups.map((g) => {
              const key = g.ids[0].id;
              const primary = g.ids.find((i) => i.isPrimary);
              const relay = !!g.email?.endsWith("privaterelay.appleid.com");
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{g.email ?? PROVIDER[g.ids[0].provider].label}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {g.ids.map((i) => {
                        const { label, Icon } = PROVIDER[i.provider];
                        return (
                          <span key={i.id} className="inline-flex items-center gap-1">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {label}
                          </span>
                        );
                      })}
                      {primary && <span className="font-medium text-foreground">Gets my emails</span>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!primary && g.email && !relay && (
                      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => act(() => makePrimary(token, g.ids[0].id))}>
                        Send my emails here
                      </Button>
                    )}
                    {groups.length > 1 &&
                      (sure === key ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={busy}
                          onClick={() => act(async () => {
                            for (const i of g.ids) await removeIdentity(token, i.id);
                          })}
                        >
                          {busy ? "Removing…" : "Yes, remove"}
                        </Button>
                      ) : (
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setSure(key)}>
                          Remove
                        </Button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {ids && groups.length === 1 && <p className="pt-4 text-xs text-muted-foreground">My only sign-in can&apos;t be removed.</p>}
        {ids && error && <p className="pt-4 text-sm text-destructive">{error}</p>}
      </Section>

      <Section title="Signed in elsewhere?" description="Signs out the app and every browser, this one too.">
        {sure === "everywhere" ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={everywhere}>
              {busy ? "Signing out…" : "Yes, sign out everywhere"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSure(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => setSure("everywhere")}>
            Sign out everywhere
          </Button>
        )}
      </Section>

      <Section id="delete" title="Delete account">
        <DeleteAccount />
      </Section>
    </div>
  );
}
