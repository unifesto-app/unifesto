"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const FIELD =
  "w-full rounded-lg bg-night-3 px-4 py-3 text-sm text-white placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
/** Remembers this tab's chat across a refresh; the token only opens a chat while it is with Assist. */
const STORE = "unifesto-assist-chat";

type Message = { id: string; side: "REQUESTER" | "ASSISTANT"; body: string; createdAt: string };
type Chat = { id: string; ticketNumber: number; withBot: boolean; contactEmail: string | null; messages: Message[] };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/support/guest/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new Error(res.status === 429 ? "Too many messages. Wait a minute and try again." : msg || "Something went wrong. Try again.");
  }
  return data as T;
}

function load(): { id: string; token: string } | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || "null");
  } catch {
    return null;
  }
}
function save(v: { id: string; token: string } | null) {
  try {
    if (v) sessionStorage.setItem(STORE, JSON.stringify(v));
    else sessionStorage.removeItem(STORE);
  } catch {
    /* private mode: the chat just won't survive a refresh */
  }
}

/** D11 + D14: a guest opens a case through the Assist bot; a person takes over on request or when Assist has no answer. */
export default function ContactClient() {
  const [chat, setChat] = useState<Chat | null>(null);
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = load();
    if (!saved) return;
    post<Chat>(`assist/${saved.id}/thread`, { token: saved.token })
      .then((c) => {
        setChat(c);
        setToken(saved.token);
      })
      .catch(() => save(null));
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.length]);

  const run = async (fn: () => Promise<Chat & { token?: string }>) => {
    setBusy(true);
    setError("");
    try {
      const c = await fn();
      if (c.token) {
        setToken(c.token);
        save({ id: c.id, token: c.token });
      }
      setChat(c);
      setText("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || busy) return;
    if (!chat) run(() => post("assist", { email: email.trim(), name: name.trim() || undefined, message: body }));
    else run(() => post(`assist/${chat.id}`, { token, body }));
  };

  const startOver = () => {
    save(null);
    setChat(null);
    setToken("");
    setText("");
  };

  return (
    <div className="space-y-4">
      {!chat ? (
        <>
          <h2 className="text-lg font-bold text-paper">Ask a question</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              required
              type="email"
              autoComplete="email"
              aria-label="Email"
              placeholder="Email, for our reply"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
              form="assist-form"
            />
            <input
              autoComplete="name"
              aria-label="Name"
              placeholder="Name (optional)"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              form="assist-form"
            />
          </div>
        </>
      ) : (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold text-paper">Request #{chat.ticketNumber}</h2>
          <button type="button" onClick={startOver} className="text-sm text-paper/60 hover:text-paper">
            New question
          </button>
        </div>
      )}

      {chat && (
        <ul className="space-y-4" aria-live="polite">
          {chat.messages.map((m) => (
            <li key={m.id} className={m.side === "REQUESTER" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm ${
                  m.side === "REQUESTER" ? "bg-primary text-primary-foreground" : "bg-night-3 text-paper"
                }`}
              >
                {m.side === "ASSISTANT" && <span className="mb-0.5 block text-xs text-paper/55">Assist</span>}
                {m.body}
              </div>
            </li>
          ))}
          {busy && <li className="text-sm text-paper/55">Assist is typing…</li>}
          <div ref={end} />
        </ul>
      )}

      {chat && !chat.withBot ? (
        <div className="rounded-lg bg-night-3 p-4 text-sm text-paper/80">
          A person on our team has your request now. We&apos;ll reply to{" "}
          <span className="font-semibold text-paper">{chat.contactEmail ?? "your email"}</span>, usually within 24 hours.
        </div>
      ) : (
        <form id="assist-form" onSubmit={send} className="space-y-4">
          <textarea
            required
            rows={chat ? 2 : 4}
            maxLength={4000}
            aria-label={chat ? "Your message" : "Your question"}
            placeholder={chat ? "Reply to Assist" : "Which event, what happened, what you need"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send(e as unknown as FormEvent);
            }}
            className={FIELD}
          />
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary disabled:opacity-60">
              {busy ? "Sending…" : chat ? "Send" : "Ask Assist"}
            </button>
            {chat && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => post(`assist/${chat.id}/handoff`, { token }))}
                className="text-sm font-semibold text-primary hover:underline disabled:opacity-60"
              >
                Talk to a person
              </button>
            )}
          </div>
        </form>
      )}

      <p className="text-xs leading-relaxed text-paper/55">
        Assist is an AI helper and can get things wrong. Your messages and email are saved as a support request so our team can
        reply; on the web, Assist can&apos;t see your bookings. A person can take over anytime. See our{" "}
        <Link href="/privacy-notice" className="underline underline-offset-2 hover:text-paper">
          privacy notice
        </Link>
        .
      </p>
    </div>
  );
}
