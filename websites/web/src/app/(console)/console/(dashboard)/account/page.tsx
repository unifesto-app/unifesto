"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Camera, CaretDown, CheckCircle, Globe, InstagramLogo, LinkedinLogo, GithubLogo } from "@unifesto/unicon/react";
import { checkUsername, updateMe, uploadAvatar, type Gender, type Me, type ProfilePatch } from "@/lib/api/account";
import { setSession, useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Textarea } from "@/console/components/ui/textarea";
import { cn } from "@/console/lib/utils/cn";
import { useAccount } from "./AccountShell";
import Section from "./Section";

/** Same rule as the API and the app. */
const USERNAME = /^[a-z0-9_]{3,50}$/;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX = 5 * 1024 * 1024;
const BIO_MAX = 1000;
/** The app's options and labels. */
const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "NON_BINARY", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const LINKS = [
  { key: "linkedinUrl", label: "LinkedIn", placeholder: "linkedin.com/in/you", Icon: LinkedinLogo },
  { key: "instagramUrl", label: "Instagram", placeholder: "instagram.com/you", Icon: InstagramLogo },
  { key: "githubUrl", label: "GitHub", placeholder: "github.com/you", Icon: GithubLogo },
  { key: "websiteUrl", label: "Website", placeholder: "yourwebsite.com", Icon: Globe },
] as const;
type LinkKey = (typeof LINKS)[number]["key"];

/** Empty clears (null); a bare domain gets https:// so the API's URL check passes. */
const link = (v: string) => {
  const t = v.trim();
  return !t ? null : /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/** The form's starting values: what the API holds now. */
const fields = (me: Me) => ({
  fullName: me.fullName ?? "",
  username: me.username ?? "",
  gender: (me.gender ?? "") as Gender | "",
  bio: me.bio ?? "",
  links: Object.fromEntries(LINKS.map((l) => [l.key, me[l.key] ?? ""])) as Record<LinkKey, string>,
});

/**
 * K19: My account is my profile, the app's Edit profile: who I am up top
 * (tap the photo to change it), then name, username, gender, bio and links.
 * A save bar rises from the bottom once something differs from what's saved.
 */
export default function ProfilePage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { me, setMe, spaces, counts } = useAccount();
  const [form, setForm] = useState(() => fields(me));
  const [taken, setTaken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  // Ask whether a changed username is free, a moment after typing stops.
  const wanted = form.username.trim().toLowerCase();
  const changed = wanted !== (me.username ?? "");
  const validName = USERNAME.test(wanted);
  useEffect(() => {
    if (!changed || !validName) return;
    let live = true;
    const t = setTimeout(() => {
      checkUsername(wanted).then((r) => live && setTaken(!r.available), () => live && setTaken(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [changed, validName, wanted]);

  const start = fields(me);
  const dirty =
    form.fullName !== start.fullName ||
    changed ||
    form.gender !== start.gender ||
    form.bio !== start.bio ||
    LINKS.some((l) => form.links[l.key] !== start.links[l.key]);

  // "Changes saved" sits in the bar for a moment, then the bar settles away.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2400);
    return () => clearTimeout(t);
  }, [saved]);

  const discard = () => {
    setForm(fields(me));
    setTaken(null);
    setError("");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    setError("");
    if (changed && !validName) return setError("Usernames are 3 to 50 lowercase letters, numbers or underscores.");
    if (changed && taken) return setError("That username is taken.");
    const patch: ProfilePatch = {
      fullName: form.fullName.trim(),
      ...(changed ? { username: wanted } : {}),
      gender: form.gender || null,
      bio: form.bio.trim() || null,
      linkedinUrl: link(form.links.linkedinUrl),
      instagramUrl: link(form.links.instagramUrl),
      githubUrl: link(form.links.githubUrl),
      websiteUrl: link(form.links.websiteUrl),
    };
    setBusy(true);
    try {
      const next = { ...me, ...(await updateMe(token, patch)) };
      setMe(next);
      setForm(fields(next));
      setTaken(null);
      if (session) setSession({ ...session, fullName: next.fullName ?? form.fullName.trim() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save my changes.");
    } finally {
      setBusy(false);
    }
  };

  const photo = async (file: File | undefined) => {
    setPhotoNote(null);
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setPhotoNote({ ok: false, text: "Use a JPG, PNG or WebP photo." });
    if (file.size > PHOTO_MAX) return setPhotoNote({ ok: false, text: "Photos can be up to 5 MB." });
    setPhotoBusy(true);
    try {
      setMe({ ...me, avatarUrl: await uploadAvatar(token, file) });
      setPhotoNote({ ok: true, text: "Photo updated." });
    } catch (err) {
      setPhotoNote({ ok: false, text: err instanceof Error ? err.message : "Couldn't upload the photo." });
    } finally {
      setPhotoBusy(false);
    }
  };

  const name = me.fullName || me.username || session?.email || "Me";
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const since = new Date(me.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: IST });
  const stats = [
    { label: "Going to", value: counts.going, href: "/console/tickets" },
    { label: "Been to", value: counts.been, href: "/console/tickets" },
    { label: "Spaces", value: new Set(spaces.map((s) => s.id)).size, href: "/console/spaces" },
  ];
  const showBar = dirty || saved;

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-5">
        <label
          title="Change my photo"
          className={cn(
            "group relative shrink-0 cursor-pointer rounded-full focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
            photoBusy && "pointer-events-none"
          )}
        >
          <span
            className={cn(
              "grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-muted font-display text-xl text-muted-foreground transition-opacity duration-200 sm:h-20 sm:w-20 sm:text-2xl",
              photoBusy && "animate-pulse opacity-50"
            )}
          >
            {me.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
          </span>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 grid h-7 w-7 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground transition-transform duration-150 ease-out group-hover:scale-110"
          >
            <Camera className="h-3.5 w-3.5" weight="fill" />
          </span>
          <input
            type="file"
            aria-label="Change my photo"
            accept={PHOTO_TYPES.join(",")}
            className="sr-only"
            disabled={photoBusy}
            onChange={(e) => {
              void photo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl leading-snug text-foreground sm:text-2xl">{name}</h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {me.username && <>@{me.username} · </>}Member since {since}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {stats.map((s) => (
              <Link key={s.label} href={s.href} className="text-muted-foreground transition-colors hover:text-foreground">
                <strong className="font-semibold tabular-nums text-foreground">{s.value}</strong> {s.label}
              </Link>
            ))}
          </p>
        </div>
      </header>
      <p aria-live="polite" className={cn("-mt-3 text-sm empty:hidden", photoNote?.ok ? "text-success" : "text-destructive")}>
        {photoBusy ? <span className="text-muted-foreground">Uploading my photo…</span> : photoNote?.text}
      </p>

      {/* The page already pads its foot, so the last section doesn't add its own. */}
      <form onSubmit={save} className="[&>section:last-of-type]:pb-0">
        <Section title="Profile" description="My name, username, gender and a line about me.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  maxLength={255}
                  autoComplete="name"
                  value={form.fullName}
                  onChange={(e) => set({ fullName: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">As it should appear on passes.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                    @
                  </span>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => {
                      set({ username: e.target.value.toLowerCase() });
                      setTaken(null);
                    }}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={50}
                    aria-invalid={changed && (!validName || !!taken)}
                    aria-describedby="username-note"
                    className="pl-7"
                  />
                </div>
                <p
                  id="username-note"
                  aria-live="polite"
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    !changed ? "text-muted-foreground" : !validName || taken ? "text-destructive" : taken === false ? "text-success" : "text-muted-foreground"
                  )}
                >
                  {!changed ? (
                    "Lowercase letters, numbers and underscores."
                  ) : !validName ? (
                    "3 to 50 lowercase letters, numbers or underscores."
                  ) : taken === null ? (
                    "Checking…"
                  ) : taken ? (
                    "That username is taken."
                  ) : (
                    <>
                      <CheckCircle className="h-3.5 w-3.5" weight="fill" aria-hidden="true" /> Available.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-2 sm:w-1/2 sm:pr-2.5">
              <Label htmlFor="gender">Gender</Label>
              <div className="relative">
                <select
                  id="gender"
                  value={form.gender}
                  onChange={(e) => set({ gender: e.target.value as Gender | "" })}
                  className="flex h-10 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-9 text-sm text-foreground transition-[border-color,box-shadow] duration-150 ease-standard focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                >
                  <option value="">Not set</option>
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <CaretDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="bio">Bio</Label>
                <span className={cn("text-xs tabular-nums", form.bio.length > BIO_MAX * 0.9 ? "text-warning" : "text-muted-foreground")}>
                  {form.bio.length}/{BIO_MAX}
                </span>
              </div>
              <Textarea
                id="bio"
                rows={4}
                maxLength={BIO_MAX}
                placeholder="A line or two about me"
                value={form.bio}
                onChange={(e) => set({ bio: e.target.value })}
                // The input's surface and focus, so it doesn't sink into the page.
                className="resize-y bg-card ring-offset-0 focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:ring-offset-0"
              />
            </div>
        </Section>

        <Section title="Links" description="Where people can find me online.">
          <div className="grid gap-4 sm:grid-cols-2">
            {LINKS.map(({ key, label, placeholder, Icon }) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>{label}</Label>
                <div className="relative">
                  <Icon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id={key}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={placeholder}
                    value={form.links[key]}
                    onChange={(e) => set({ links: { ...form.links, [key]: e.target.value } })}
                    className="pl-9"
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Rises once something differs from what's saved. A zero-height sticky anchor, so the hidden bar takes no
            room (no scroll on a page that fits); the spacer before it makes room only while it shows, so at the
            foot of the page the bar sits below the last fields instead of over them. Inert while hidden. */}
        <div aria-hidden="true" className={cn("transition-[height] duration-300 ease-out motion-reduce:transition-none", showBar ? "h-24" : "h-0")} />
        <div className="sticky bottom-4 z-10 h-0">
        <div
          inert={!showBar}
          className={cn(
            "absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-popover px-4 py-3 shadow-md transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
            showBar ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
          )}
        >
          <p aria-live="polite" className="text-sm">
            {dirty ? (
              error ? <span className="text-destructive">{error}</span> : <span className="text-muted-foreground">Unsaved changes</span>
            ) : (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle className="h-4 w-4" weight="fill" aria-hidden="true" /> Changes saved
              </span>
            )}
          </p>
          {dirty && (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={discard} disabled={busy}>
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
        </div>
      </form>
    </div>
  );
}
