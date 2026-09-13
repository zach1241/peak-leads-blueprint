import { saveTask, saveClient, saveProject } from "@/app/work-actions";
import {
  taskStatuses,
  priorities,
  clientStatuses,
  projectStatuses,
  label,
} from "@/lib/data/constants";
import type { Directory, taskDetail } from "@/lib/data/queries";
import type { Tables } from "@/lib/database.types";
import { ActionForm } from "./action-form";
import { Field, SelectField, TextField } from "./shared";
const options = (values: readonly string[]) =>
  values.map((value) => ({ value, label: label(value) }));
export function TaskForm({
  directory,
  task,
}: {
  directory: Directory;
  task?: Awaited<ReturnType<typeof taskDetail>>;
}) {
  return (
    <ActionForm action={saveTask} submit={task ? "Save task" : "Create task"}>
      <input type="hidden" name="id" value={task?.id ?? ""} />
      <div className="form-grid">
        <Field
          name="title"
          title="Task title"
          value={task?.title}
          required
          maxLength={240}
        />
        <SelectField
          name="status"
          title="Status"
          value={task?.status ?? "todo"}
          options={options(taskStatuses)}
        />
        <SelectField
          name="priority"
          title="Priority"
          value={task?.priority ?? "medium"}
          options={options(priorities)}
        />
        <Field
          name="due_date"
          title="Due date"
          type="date"
          value={task?.due_date}
        />
        <SelectField
          name="project_id"
          title="Project"
          value={task?.project_id}
          empty="No project"
          options={directory.projects.map((p) => ({
            value: p.id,
            label: p.name,
          }))}
        />
        <SelectField
          name="client_id"
          title="Direct client (optional)"
          value={task?.client_id}
          empty="No direct client"
          options={directory.clients.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
        />
        <TextField
          name="description"
          title="Description"
          value={task?.description}
          maxLength={20000}
        />
        <fieldset className="assignee-field full-field">
          <legend>Assignees</legend>
          {directory.members.map((m) => (
            <label className="checkbox-label" key={m.id}>
              <input
                type="checkbox"
                name="assignees"
                value={m.user_id}
                defaultChecked={task?.task_assignees.some(
                  (a) => a.user_id === m.user_id,
                )}
              />
              {m.profiles?.full_name || "Team member"}{" "}
              <small>{m.user_id.slice(0, 8)}</small>
            </label>
          ))}
        </fieldset>
      </div>
    </ActionForm>
  );
}
export function ClientForm({ client }: { client?: Tables<"clients"> }) {
  return (
    <ActionForm
      action={saveClient}
      submit={client ? "Save client" : "Create client"}
    >
      <input type="hidden" name="id" value={client?.id ?? ""} />
      <div className="form-grid">
        <Field
          name="name"
          title="Client name"
          value={client?.name}
          required
          maxLength={160}
        />
        <Field
          name="slug"
          title="Slug (e.g. acme-studio)"
          value={client?.slug}
          required
          maxLength={100}
        />
        <SelectField
          name="status"
          title="Status"
          value={client?.status ?? "active"}
          options={options(clientStatuses)}
        />
        <Field
          name="website"
          title="Website"
          value={client?.website}
          type="url"
          maxLength={2048}
        />
        <Field
          name="primary_contact_name"
          title="Primary contact name"
          value={client?.primary_contact_name}
          maxLength={120}
        />
        <Field
          name="primary_contact_email"
          title="Primary contact email"
          value={client?.primary_contact_email}
          type="email"
          maxLength={254}
        />
        <TextField name="notes" title="Notes" value={client?.notes} />
      </div>
    </ActionForm>
  );
}
export function ProjectForm({
  directory,
  project,
}: {
  directory: Directory;
  project?: Tables<"projects">;
}) {
  return (
    <ActionForm
      action={saveProject}
      submit={project ? "Save project" : "Create project"}
    >
      <input type="hidden" name="id" value={project?.id ?? ""} />
      <div className="form-grid">
        <Field
          name="name"
          title="Project name"
          value={project?.name}
          required
          maxLength={160}
        />
        <SelectField
          name="status"
          title="Status"
          value={project?.status ?? "planned"}
          options={options(projectStatuses)}
        />
        <SelectField
          name="client_id"
          title="Client"
          value={project?.client_id}
          empty="No client"
          options={directory.clients.map((c) => ({
            value: c.id,
            label: c.name,
          }))}
        />
        <Field
          name="start_date"
          title="Start date"
          type="date"
          value={project?.start_date}
        />
        <Field
          name="due_date"
          title="Due date"
          type="date"
          value={project?.due_date}
        />
        <TextField
          name="description"
          title="Description"
          value={project?.description}
        />
      </div>
    </ActionForm>
  );
}
