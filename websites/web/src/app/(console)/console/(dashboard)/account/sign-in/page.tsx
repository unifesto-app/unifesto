"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppleLogo, EnvelopeSimple, GoogleLogo, Phone } from "@unifesto/unicon/react";
import { getIdentities, makePrimary, removeIdentity, signOutEverywhere, type Identity } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { signOut } from "@/console/lib/utils/auth";
import { useAccount } from "../AccountShell";

const PROVIDER = {
  EMAIL: { label: "Email code", Icon: EnvelopeSimple },
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

/** The app's Account settings: my phone, how I sign in, and signing out everywhere. */
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
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-medium text-paper/75">Mobile number</h2>
        <p className="mt-1.5 text-paper">{phone(me.mobileNumber)}</p>
        <p className="mt-1 text-xs text-paper/55">
          Organisers reach me here about my tickets. To change it,{" "}
          <Link href="/help/contact" className="underline hover:text-paper">
            contact support
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-paper/75">Sign-in methods</h2>
        {!ids ? (
          <p className="mt-3 text-paper/65">{error || "Loading…"}</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/[0.06]">
            {groups.map((g) => {
              const key = g.ids[0].id;
              const primary = g.ids.find((i) => i.isPrimary);
              const relay = !!g.email?.endsWith("privaterelay.appleid.com");
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-paper">{g.email ?? PROVIDER[g.ids[0].provider].label}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-paper/60">
                      {g.ids.map((i) => {
                        const { label, Icon } = PROVIDER[i.provider];
                        return (
                          <span key={i.id} className="inline-flex items-center gap-1">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {label}
                          </span>
                        );
                      })}
                      {primary && <span className="font-medium text-primary">Gets my emails</span>}
                    </p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {!primary && g.email && !relay && (
                      <button type="button" disabled={busy} onClick={() => act(() => makePrimary(token, g.ids[0].id))} className="text-paper/75 hover:text-paper hover:underline">
                        Send my emails here
                      </button>
                    )}
                    {groups.length > 1 &&
                      (sure === key ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(async () => {
                            for (const i of g.ids) await removeIdentity(token, i.id);
                          })}
                          className="font-medium text-red-400 hover:underline"
                        >
                          {busy ? "Removing…" : "Yes, remove"}
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => setSure(key)} className="text-paper/75 hover:text-paper hover:underline">
                          Remove
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {ids && groups.length === 1 && <p className="mt-1 text-xs text-paper/55">My only sign-in can&apos;t be removed.</p>}
      </section>

      <section>
        <h2 className="text-sm font-medium text-paper/75">Signed in elsewhere?</h2>
        <p className="mt-1.5 text-sm text-paper/65">Signs out the app and every browser, this one too.</p>
        {sure === "everywhere" ? (
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={busy} onClick={everywhere} className="btn btn-sm btn-primary">
              {busy ? "Signing out…" : "Yes, sign out everywhere"}
            </button>
            <button type="button" onClick={() => setSure(null)} className="btn btn-sm btn-secondary">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setSure("everywhere")} className="btn btn-sm btn-secondary mt-3">
            Sign out everywhere
          </button>
        )}
      </section>

      {ids && error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
