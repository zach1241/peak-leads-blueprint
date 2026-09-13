import { activity, directories } from "@/lib/data/queries";
import { ActivityList } from "@/components/work/activity-list";
import { PageHeading, Pagination, pageNumber } from "@/components/work/shared";
export default async function Activity({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const [events, directory] = await Promise.all([
    activity(page),
    directories(),
  ]);
  return (
    <>
      <PageHeading
        title="Activity"
        description="A shared record of progress across your workspace."
      />
      <section className="panel">
        <ActivityList rows={events.rows} members={directory.members} />
        <Pagination page={page} count={events.count} href="/activity" />
      </section>
    </>
  );
}
