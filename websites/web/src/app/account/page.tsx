"use client";

import { useEffect, useState, type FormEvent } from "react";
import { checkUsername, getMe, updateMe, uploadAvatar, type Me } from "@/lib/api/account";
import { setSession, useWebSession } from "@/lib/auth";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
/** Same rule as the API and the app. */
const USERNAME = /^[a-z0-9_]{3,50}$/;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PHOTO_MAX = 5 * 1024 * 1024;

/** K19: My profile: name, username (with the availability check) and photo. */
export default function ProfilePage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [me, setMe] = useState<Me | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [taken, setTaken] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    getMe(token).then(
      (m) => {
        setMe(m);
        setFullName(m.fullName ?? "");
        setUsername(m.username ?? "");
      },
      (e) => setError(e.message),
    );
  }, [token]);

  // Ask whether a changed username is free, a moment after typing stops.
  const wanted = username.trim().toLowerCase();
  const changed = !!me && wanted !== (me.username ?? "");
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
    setBusy(true);
    try {
      const m = await updateMe(token, { fullName: fullName.trim(), ...(changed ? { username: wanted } : {}) });
      setMe({ ...me!, ...m });
      setUsername(m.username ?? wanted);
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
      const avatarUrl = await uploadAvatar(token, file);
      setMe((m) => (m ? { ...m, avatarUrl } : m));
      setMsg("Photo updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the photo.");
    } finally {
      setBusy(false);
    }
  };

  if (!me) return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading My profile…</p>;

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center gap-4">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-night-3 text-lg font-semibold text-paper">
            {(fullName || session?.email || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
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
      </div>

      <label className="block space-y-1.5">
        <span className="block text-sm font-medium text-paper/75">Full name</span>
        <input required maxLength={255} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={FIELD} />
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

      {error && <p className="text-sm text-red-400">{error}</p>}
      {msg && <p className="text-sm text-paper/75">{msg}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary">
        {busy ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
