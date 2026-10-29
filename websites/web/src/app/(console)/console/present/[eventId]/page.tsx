"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { io } from "socket.io-client";
import { call } from "@/console/lib/api/call";
import { currentToken } from "@/console/lib/utils/auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Pings carry the updates; this only covers a missed one or a dropped socket. */
const SAFETY_REFRESH_MS = 15_000;
const DEFAULT_ACCENT = "#e8e8ea";
const LETTERS = "ABCDEFGHIJ";

type Mode = "poll" | "qa" | "quiz";
const MODE_KEYS: Record<string, Mode> = { "1": "poll", "2": "qa", "3": "quiz" };
const MODE_LABEL: Record<Mode, string> = { poll: "Poll", qa: "Q&A", quiz: "Quiz" };

interface Snapshot {
  serverNow: string;
  event: { title: string };
  brand: { name: string | null; color: string | null; logoUrl: string | null } | null;
  mode: Mode;
  poll: {
    question: string;
    options: string[];
    status: "LIVE" | "CLOSED";
    totalVotes: number;
    results: number[] | null;
  } | null;
  questions: { id: string; text: string; status: "APPROVED" | "ANSWERED"; pinned: boolean; agendaTitle: string | null; votes: number }[];
  quiz: {
    title: string;
    status: "LIVE" | "ENDED";
    questionCount: number;
    question: {
      position: number;
      prompt: string;
      options: string[];
      openedAt: string | null;
      closesAt: string | null;
      revealAt: string | null;
      closed: boolean;
      answered: number;
      correctIndexes: number[] | null;
      results: number[] | null;
    } | null;
    leaderboard: { players: number; top: { rank: number; name: string; score: number }[] };
  } | null;
}

/**
 * L4 projector view: the event's live engagement, full screen, for the venue
 * screen. Read-only. Opened with the display link (`#k=<token>`, kept in the
 * fragment so it never reaches a server log) or by a signed-in operator.
 * Dark on purpose: this one page is for a projector, not the light console.
 */
export default function ProjectorPage() {
  const eventId = useParams().eventId as string;
  // Undefined only during the server render; the hash is read once in the browser.
  const [token] = useState<string | null | undefined>(() =>
    typeof window === "undefined" ? undefined : new URLSearchParams(window.location.hash.slice(1)).get("k"),
  );
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [pinned, setPinned] = useState<Mode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Server clock minus ours, so the countdown matches the server's deadline.
  const [skew, setSkew] = useState(0);

  const load = useCallback(async () => {
    if (token === undefined) return;
    if (!token && !(await currentToken())) {
      setError("Sign in to the Space app, or open this screen with the display link from Live polls.");
      return;
    }
    const res = await call<Snapshot>(`/events/${eventId}/projector`, {
      headers: token ? { "X-Display-Token": token } : {},
    });
    if (res.ok) {
      setSkew(Date.parse(res.data.serverNow) - Date.now());
      setSnap(res.data);
      setError("");
      setOffline(false);
    } else if (res.message === "No connection") {
      setOffline(true);
    } else {
      setSnap(null);
      setError(res.message);
    }
  }, [eventId, token]);

  // Live: the engagement room's "something changed" pings, then a refetch.
  useEffect(() => {
    if (token === undefined) return;
    void load();
    const socket = io(`${BACKEND_URL}/leaderboard`, {
      transports: ["websocket"],
      // A function, so each (re)connect waits for the session and sends the current token.
      auth: token ? {} : (cb) => void currentToken().then((t) => cb({ token: t })),
    });
    const subscribe = () =>
      socket.emit("engagement:subscribe", token ? { eventId, displayToken: token } : { eventId }, (ack: { error?: string }) => {
        if (ack?.error) void load();
      });
    socket.on("connect", subscribe);
    socket.on("engagement:changed", () => void load());
    // The server drops display screens when the link is regenerated: refetch to show why.
    socket.on("disconnect", (reason) => {
      if (reason === "io server disconnect") void load();
    });
    const safety = setInterval(() => void load(), SAFETY_REFRESH_MS);
    return () => {
      clearInterval(safety);
      socket.disconnect();
    };
  }, [eventId, token, load]);

  // A quiz question reveals on the server's clock, with no ping: refetch right after.
  const revealAt = snap?.quiz?.question && !snap.quiz.question.closed ? snap.quiz.question.revealAt : null;
  useEffect(() => {
    if (!revealAt) return;
    const ms = Date.parse(revealAt) - (Date.now() + skew) + 150;
    const t = setTimeout(() => void load(), Math.max(ms, 0));
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [revealAt, skew, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      } else if (MODE_KEYS[e.key]) {
        setPinned(MODE_KEYS[e.key]);
      } else if (e.key === "0" || e.key === "a" || e.key === "A") {
        setPinned(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accent = snap?.brand?.color || DEFAULT_ACCENT;
  const mode = pinned ?? snap?.mode ?? "qa";

  return (
    <main
      className="fixed inset-0 flex flex-col overflow-hidden bg-black px-[4vw] py-[3vh] font-sans text-zinc-100"
      style={{ ["--accent" as string]: accent }}
    >
      <header className="flex items-center gap-4 text-[clamp(1rem,1.6vw,1.75rem)] text-zinc-400">
        {snap?.brand?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snap.brand.logoUrl} alt="" className="h-[clamp(2rem,4vh,3.5rem)] w-auto object-contain" />
        )}
        <span className="truncate">{snap?.event.title ?? "Projector view"}</span>
        {offline && <span className="ml-auto text-amber-400">Reconnecting…</span>}
      </header>

      <section className="flex min-h-0 flex-1 flex-col justify-center py-[3vh]">
        {error ? (
          <Message title="This screen can’t show the event" body={error} />
        ) : !snap ? (
          <Message title="Loading…" />
        ) : mode === "poll" ? (
          <PollView poll={snap.poll} />
        ) : mode === "quiz" ? (
          <QuizView quiz={snap.quiz} now={now + skew} />
        ) : (
          <QaView questions={snap.questions} />
        )}
      </section>

      <footer className="flex items-center gap-3 text-[clamp(0.75rem,1vw,1rem)] text-zinc-600">
        <span>{pinned ? `Holding ${MODE_LABEL[pinned]}. Press 0 to follow live.` : "Following live. Press 1, 2 or 3 to hold a view."}</span>
        <span>F for full screen</span>
        <span className="ml-auto">{snap?.brand?.name ?? "Unifesto"}</span>
      </footer>
    </main>
  );
}

function Message({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center">
      <p className="text-[clamp(2rem,4vw,4.5rem)] font-semibold leading-tight">{title}</p>
      {body && <p className="mx-auto mt-4 max-w-[50ch] text-[clamp(1.1rem,1.8vw,2rem)] text-zinc-400">{body}</p>}
    </div>
  );
}

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

function Bars({ options, results, correct }: { options: string[]; results: number[]; correct?: number[] | null }) {
  const total = results.reduce((a, b) => a + b, 0);
  const top = Math.max(...results);
  return (
    <ul className="space-y-[2vh]">
      {options.map((o, i) => {
        const p = pct(results[i], total);
        const lead = correct ? correct.includes(i) : results[i] === top && top > 0;
        return (
          <li key={i} className={correct && !lead ? "opacity-50" : ""}>
            <div className="mb-1 flex items-baseline justify-between gap-6 text-[clamp(1.25rem,2.4vw,2.75rem)]">
              <span className="truncate">
                <span className="mr-3 text-zinc-500">{LETTERS[i]}</span>
                {o}
                {correct && lead && <span className="ml-3" style={{ color: "var(--accent)" }}>✓</span>}
              </span>
              <span className="tabular-nums font-semibold">{p}%</span>
            </div>
            <div className="h-[clamp(0.75rem,2vh,1.5rem)] overflow-hidden rounded-full bg-zinc-900">
              <div
                className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 motion-safe:ease-out"
                style={{ width: `${p}%`, background: lead ? "var(--accent)" : "#52525b" }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PollView({ poll }: { poll: Snapshot["poll"] }) {
  if (!poll) return <Message title="No poll yet" body="Launch a poll from Live polls and it shows up here." />;
  return (
    <div className="mx-auto w-full max-w-[110rem]">
      <p className="mb-2 text-[clamp(1rem,1.5vw,1.6rem)] text-zinc-500">{poll.status === "LIVE" ? "Live poll" : "Poll closed"}</p>
      <h1 className="mb-[4vh] text-[clamp(2.25rem,4.5vw,5.5rem)] font-semibold leading-tight">{poll.question}</h1>
      {poll.results ? (
        <Bars options={poll.options} results={poll.results} />
      ) : (
        <ul className="space-y-[1.5vh] text-[clamp(1.25rem,2.4vw,2.75rem)]">
          {poll.options.map((o, i) => (
            <li key={i}>
              <span className="mr-3 text-zinc-500">{LETTERS[i]}</span>
              {o}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-[4vh] text-[clamp(1.1rem,1.8vw,2rem)] text-zinc-400">
        {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"}
        {!poll.results && " · results show when the poll closes"}
      </p>
    </div>
  );
}

function QaView({ questions }: { questions: Snapshot["questions"] }) {
  if (!questions.length) return <Message title="Ask away" body="Questions approved by the organisers appear here, most upvoted first." />;
  const [first, ...rest] = questions;
  const lead = first.pinned ? first : null;
  const list = (lead ? rest : questions).slice(0, 6);
  return (
    <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-[3vh]">
      {lead && (
        <div className="rounded-2xl border-2 bg-zinc-950 p-[3vh]" style={{ borderColor: "var(--accent)" }}>
          <p className="mb-2 text-[clamp(1rem,1.5vw,1.6rem)]" style={{ color: "var(--accent)" }}>
            Now answering{lead.agendaTitle ? ` · ${lead.agendaTitle}` : ""}
          </p>
          <p className="text-[clamp(2rem,4vw,4.75rem)] font-semibold leading-tight">{lead.text}</p>
          <p className="mt-3 text-[clamp(1.1rem,1.8vw,2rem)] text-zinc-400">{votes(lead.votes)}</p>
        </div>
      )}
      <ol className="space-y-[2vh]">
        {list.map((q) => (
          <li key={q.id} className={`flex items-baseline gap-6 ${q.status === "ANSWERED" ? "opacity-40" : ""}`}>
            <span className="w-[4ch] shrink-0 text-right text-[clamp(1.5rem,2.6vw,3rem)] font-semibold tabular-nums" style={{ color: "var(--accent)" }}>
              {q.votes}
            </span>
            <span className="text-[clamp(1.4rem,2.5vw,3rem)] leading-snug">
              {q.text}
              {q.status === "ANSWERED" && <span className="ml-3 text-zinc-500">Answered</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const votes = (n: number) => `${n} ${n === 1 ? "upvote" : "upvotes"}`;

function Board({ board, title }: { board: NonNullable<Snapshot["quiz"]>["leaderboard"]; title: string }) {
  return (
    <div>
      <p className="mb-[2vh] text-[clamp(1rem,1.5vw,1.6rem)] text-zinc-500">{title}</p>
      {board.top.length ? (
        <ol className="space-y-[1.2vh]">
          {board.top.map((r, i) => (
            <li key={i} className="flex items-baseline gap-4 text-[clamp(1.25rem,2.2vw,2.5rem)]">
              <span className="w-[2ch] text-right tabular-nums text-zinc-500">{r.rank}</span>
              <span className="flex-1 truncate" style={r.rank === 1 ? { color: "var(--accent)" } : undefined}>{r.name}</span>
              <span className="tabular-nums font-semibold">{r.score}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[clamp(1.25rem,2vw,2.25rem)] text-zinc-400">Scores appear after the first question.</p>
      )}
    </div>
  );
}

function QuizView({ quiz, now }: { quiz: Snapshot["quiz"]; now: number }) {
  if (!quiz) return <Message title="No quiz yet" body="Start a quiz from Live quizzes and it shows up here." />;
  const q = quiz.question;
  if (!q) {
    return (
      <div className="mx-auto w-full max-w-[80rem]">
        <h1 className="mb-[4vh] text-[clamp(2.25rem,4.5vw,5.5rem)] font-semibold leading-tight">{quiz.title}</h1>
        <Board board={quiz.leaderboard} title={quiz.status === "ENDED" ? "Final board" : "Board"} />
      </div>
    );
  }
  const opensIn = q.openedAt ? Date.parse(q.openedAt) - now : 0;
  const left = q.closesAt ? Math.max(0, Math.ceil((Date.parse(q.closesAt) - now) / 1000)) : 0;
  const clock = q.closed ? "Time’s up" : opensIn > 0 ? "Get ready" : `${left}`;
  return (
    <div className="mx-auto grid w-full max-w-[120rem] gap-[4vw] lg:grid-cols-[2fr_1fr]">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-6 text-[clamp(1rem,1.5vw,1.6rem)] text-zinc-500">
          <span>
            {quiz.title} · question {q.position + 1} of {quiz.questionCount}
          </span>
          <span>{q.answered} answered</span>
        </div>
        <div className="mb-[4vh] flex items-start justify-between gap-6">
          <h1 className="text-[clamp(2.25rem,4.2vw,5rem)] font-semibold leading-tight">{q.prompt}</h1>
          <span
            className="shrink-0 text-[clamp(2.5rem,6vw,7rem)] font-semibold tabular-nums leading-none"
            style={{ color: "var(--accent)" }}
            aria-live="polite"
          >
            {clock}
          </span>
        </div>
        {q.results ? (
          <Bars options={q.options} results={q.results} correct={q.correctIndexes} />
        ) : (
          <ul className="grid gap-[2vh] sm:grid-cols-2">
            {q.options.map((o, i) => (
              <li key={i} className="rounded-2xl bg-zinc-900 p-[2.5vh] text-[clamp(1.4rem,2.6vw,3rem)]">
                <span className="mr-3 text-zinc-500">{LETTERS[i]}</span>
                {o}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Board board={{ ...quiz.leaderboard, top: quiz.leaderboard.top.slice(0, 5) }} title="Top 5" />
    </div>
  );
}
