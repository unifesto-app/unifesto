"use client";

import { useEffect, useState, type FormEvent } from "react";
import { checkUsername, updateMe, uploadAvatar, type Gender, type ProfilePatch } from "@/lib/api/account";
import { setSession, useWebSession } from "@/lib/auth";
import { useAccount } from "./AccountShell";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
/** Same rule as the API and the app. */
const USERNAME = /^[a-z0-9_]{3,50}$/;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX = 5 * 1024 * 1024;
/** The app's options and labels. */
const GENDERS: { value: Gender; label: string }[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "NON_BINARY", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
const LINKS = [
  { key: "linkedinUrl", label: "LinkedIn", placeholder: "linkedin.com/in/you" },
  { key: "instagramUrl", label: "Instagram", placeholder: "instagram.com/you" },
  { key: "githubUrl", label: "GitHub", placeholder: "github.com/you" },
  { key: "websiteUrl", label: "Website", placeholder: "yourwebsite.com" },
] as const;
type LinkKey = (typeof LINKS)[number]["key"];

/** Empty clears (null); a bare domain gets https:// so the API's URL check passes. */
const link = (v: string) => {
  const t = v.trim();
  return !t ? null : /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

/** K19: My profile, the app's Edit profile: photo, name, username, gender, bio and links. */
export default function ProfilePage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { me, setMe } = useAccount();
  const [fullName, setFullName] = useState(me.fullName ?? "");
  const [username, setUsername] = useState(me.username ?? "");
  const [gender, setGender] = useState<Gender | "">(me.gender ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [links, setLinks] = useState<Record<LinkKey, string>>({
    linkedinUrl: me.linkedinUrl ?? "",
    instagramUrl: me.instagramUrl ?? "",
    githubUrl: me.githubUrl ?? "",
    websiteUrl: me.websiteUrl ?? "",
  });
  const [taken, setTaken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Ask whether a changed username is free, a moment after typing stops.
  const wanted = username.trim().toLowerCase();
  const changed = wanted !== (me.username ?? "");
  useEffect(() => {
    if (!changed || !USERNAME.test(wanted)) return;
    let live = true;
    const t = setTimeout(() => {
      checkUsername(wanted).then((r) => live && setTaken(!r.available), () => live && setTaken(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [changed, wanted]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (changed && !USERNAME.test(wanted)) return setError("Usernames are 3 to 50 lowercase letters, numbers or underscores.");
    if (changed && taken) return setError("That username is taken.");
    const patch: ProfilePatch = {
      fullName: fullName.trim(),
      ...(changed ? { username: wanted } : {}),
      gender: gender || null,
      bio: bio.trim() || null,
      linkedinUrl: link(links.linkedinUrl),
      instagramUrl: link(links.instagramUrl),
      githubUrl: link(links.githubUrl),
      websiteUrl: link(links.websiteUrl),
    };
    setBusy(true);
    try {
      const m = await updateMe(token, patch);
      setMe({ ...me, ...m });
      setUsername(m.username ?? wanted);
      setLinks({
        linkedinUrl: m.linkedinUrl ?? "",
        instagramUrl: m.instagramUrl ?? "",
        githubUrl: m.githubUrl ?? "",
        websiteUrl: m.websiteUrl ?? "",
      });
      setTaken(null);
      if (session) setSession({ ...session, fullName: m.fullName ?? fullName.trim() });
      setMsg("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const photo = async (file: File | undefined) => {
    setMsg("");
    setError("");
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) return setError("Use a JPG, PNG or WebP photo.");
    if (file.size > PHOTO_MAX) return setError("Photos can be up to 5 MB.");
    setBusy(true);
    try {
      setMe({ ...me, avatarUrl: await uploadAvatar(token, file) });
      setMsg("Photo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <label className="btn btn-sm btn-secondary cursor-pointer">
        Change photo
        <input
          type="file"
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void photo(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-paper/75">Full name</span>
        <input
          required
          maxLength={255}
          autoComplete="name"
          placeholder="As it should appear on passes"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={FIELD}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-paper/75">Username</span>
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase());
            setTaken(null);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={50}
          className={FIELD}
        />
        {changed && (
          <span className={`block text-xs ${!USERNAME.test(wanted) || taken ? "text-red-400" : "text-paper/60"}`} aria-live="polite">
            {!USERNAME.test(wanted)
              ? "3 to 50 lowercase letters, numbers or underscores."
              : taken === null
                ? "Checking…"
                : taken
                  ? "That username is taken."
                  : "Available."}
          </span>
        )}
      </label>

      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-paper/75">Gender</span>
        <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")} className={FIELD}>
          <option value="">Not set</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-paper/75">Bio</span>
        <textarea
          rows={3}
          maxLength={1000}
          placeholder="A line or two about you"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className={`${FIELD} resize-y`}
        />
      </label>

      <fieldset className="space-y-3">
        <legend className="mb-1.5 text-sm font-medium text-paper/75">Links</legend>
        {LINKS.map((l) => (
          <label key={l.key} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm text-paper/65">{l.label}</span>
            <input
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={l.placeholder}
              value={links[l.key]}
              onChange={(e) => setLinks({ ...links, [l.key]: e.target.value })}
              className={FIELD}
            />
          </label>
        ))}
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {msg && <p className="text-sm text-paper/75">{msg}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
