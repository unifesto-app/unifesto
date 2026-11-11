import Link from "next/link";
import Reveal from "@/components/Reveal";
import VolunteerForm from "@/components/VolunteerForm";
import { getContent, pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Join the WeGoBeyond crew in Hyderabad. Volunteer, speak, mentor or host at our workshops, meetups and hackathons.";

export const metadata = pageMetadata("Join the crew", DESCRIPTION, "/volunteer");

export default async function VolunteerPage() {
  const { crewForm, supportInbox } = await getContent();

  return (
    <section className="wrap pb-28 pt-12">
      <Reveal trigger="load" stagger>
        <h1 data-reveal-item>
          Join the
          <br />
          <span className="text-rust">crew.</span>
        </h1>
        <p data-reveal-item className="lead mt-6 max-w-[44ch] text-silver">
          {crewForm.intro}
        </p>
        <Link data-reveal-item href="/crew" className="small mt-6 inline-block transition-colors hover:text-rust">
          Meet the crew →
        </Link>
      </Reveal>

      <Reveal delay={0.06} className="mt-14 rounded-[28px] bg-ink-2 p-6 sm:p-10">
        <VolunteerForm form={crewForm} />
      </Reveal>

      <p className="mt-6 text-silver">
        Questions? Write to{" "}
        <a href={`mailto:${supportInbox}`} className="text-paper transition-colors hover:text-rust">
          {supportInbox}
        </a>
      </p>
    </section>
  );
}
