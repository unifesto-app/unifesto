import Link from "next/link";
import Reveal from "@/components/Reveal";
import { getContent, pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "The WeGoBeyond crew: the speakers, hosts, mentors, judges and volunteers who make our workshops, meetups and hackathons happen.";

export const metadata = pageMetadata("The crew", DESCRIPTION, "/crew");

// Film credits: every name the same size, "Role at Event" (or just the role) under it,
// in the order they were added in Apex.
export default async function CrewPage() {
  const { team } = await getContent();

  return (
    <section className="wrap pb-28 pt-12">
      <Reveal trigger="load" stagger>
        <h1 data-reveal-item>
          The <span className="text-rust">crew.</span>
        </h1>
        <p data-reveal-item className="lead mt-6 max-w-[44ch] text-silver">
          The speakers, hosts, mentors, judges and volunteers who make every room happen.
        </p>
      </Reveal>

      <div className="mt-14 border-t-[1.5px] border-line pt-12">
        {team.length > 0 ? (
          <Reveal stagger as="ul" className="grid gap-x-10 gap-y-10 text-center sm:grid-cols-2 lg:grid-cols-3">
            {team.map((m, i) => (
              <li key={`${m.name}-${i}`} data-reveal-item>
                <p className="h3">{m.name}</p>
                <p className="caption mt-2 text-silver">
                  <span className="small text-rust">{m.role}</span>
                  {m.event ? ` at ${m.event}` : null}
                </p>
              </li>
            ))}
          </Reveal>
        ) : (
          <p className="lead max-w-[44ch] text-silver">The first names go up after our next room.</p>
        )}
      </div>

      <div className="mt-16 flex flex-col gap-6 border-t-[1.5px] border-line pt-12 md:flex-row md:items-center md:justify-between">
        <p className="lead max-w-[40ch]">Want your name here? Volunteer, speak, mentor or host.</p>
        <Link href="/volunteer" className="btn btn-paper shrink-0 self-start md:self-auto">
          Join the crew →
        </Link>
      </div>
    </section>
  );
}
