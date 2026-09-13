import { requireWorkspace } from "@/lib/data/workspace";
import { ActionForm } from "@/components/work/action-form";
import { PageHeading, Field } from "@/components/work/shared";
import { selectWorkspace, saveProfile } from "@/app/work-actions";
export default async function Settings() {
  const { db, user, organizations, organization, membership } =
    await requireWorkspace();
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw new Error("Unable to load your profile.");
  return (
    <>
      <PageHeading
        title="Settings"
        description="Your profile and active workspace."
      />
      <section className="panel form-panel">
        <h2>Active workspace</h2>
        <p className="data-note">
          Your role: {membership.role}. Switching workspaces changes the records
          you see and edit.
        </p>
        <div className="workspace-select">
          <ActionForm action={selectWorkspace} submit="Switch workspace">
            <label>
              Workspace
              <select name="organization_id" defaultValue={organization.id}>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </ActionForm>
        </div>
        <h2>Your profile</h2>
        <p className="data-note">Signed in as {user.email}</p>
        <ActionForm action={saveProfile} submit="Save profile">
          <div className="form-grid">
            <Field
              title="Full name"
              name="full_name"
              value={profile.full_name}
              maxLength={120}
            />
            <Field
              title="Avatar URL (HTTPS)"
              name="avatar_url"
              value={profile.avatar_url}
              type="url"
              maxLength={2048}
            />
          </div>
        </ActionForm>
      </section>
    </>
  );
}
