/**
 * A block of an account page, without a card: a hairline above, title and
 * note beside the content from xl up (narrower, the side column would squeeze
 * it), above it otherwise. My account, Security and Notifications use it.
 */
export default function Section({
  title,
  description,
  id,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** For links that jump here, like /console/account/sign-in#delete. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="grid scroll-mt-8 gap-5 border-t border-border py-8 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-12">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}
