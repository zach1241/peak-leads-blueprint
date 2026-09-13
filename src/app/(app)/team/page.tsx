import { Avatar } from "@/components/avatar";
import { directories } from "@/lib/data/queries";
import { PageHeading, Badge } from "@/components/work/shared";
export default async function Team() {
  const { members } = await directories();
  return (
    <>
      <PageHeading
        title="Team"
        description="The people moving your workspace forward."
      />
      <section className="panel">
        <ul className="team-list">
          {members.map((m) => (
            <li key={m.id}>
              <Avatar
                key={`${m.user_id}:${m.profiles?.updated_at ?? ""}`}
                name={m.profiles?.full_name || "Team member"}
                url={m.profiles?.avatar_url}
              />
              <div>
                <strong>{m.profiles?.full_name || "Team member"}</strong>
                <small>Member {m.user_id.slice(0, 8)}</small>
                {m.profiles?.avatar_url && (
                  <a
                    className="text-link"
                    href={m.profiles.avatar_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View avatar ↗
                  </a>
                )}
              </div>
              <Badge value={m.role} />
            </li>
          ))}
        </ul>
      </section>
      <p className="data-note">
        Memberships are managed by your workspace administrator. Private
        authentication emails are not exposed in the directory.
      </p>
    </>
  );
}
