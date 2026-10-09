"use client";

import { useActionState, useId, useState } from "react";
import { bulkAssignServices, type WorkState } from "@/app/work-actions";
import { Avatar } from "@/components/avatar";
import { ConnectClientService } from "./connect-client-service";
import type { Directory } from "@/lib/data/queries";
import type { ServiceAssignmentOption } from "@/lib/data/service-assignments";
import styles from "./service-assignment-editor.module.css";

const allClients = "all";
const noClient = "none";

export function ServiceAssignmentEditor({
  organizationId,
  services,
  members,
  clients,
  templates,
  clientId,
}: {
  organizationId: string;
  services: ServiceAssignmentOption[];
  members: Directory["members"];
  clients: Directory["clients"];
  templates: { id: string; name: string }[];
  clientId?: string;
}) {
  const id = useId();
  const [client, setClient] = useState(clientId ?? "");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [leaveUnassigned, setLeaveUnassigned] = useState(false);
  const [scope, setScope] = useState("future");
  const [showResult, setShowResult] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [state, formAction, pending] = useActionState<WorkState, FormData>(
    async (previous, form) => {
      try {
        return await bulkAssignServices(previous, form);
      } catch {
        return { error: "Unable to save service assignments. Please try again." };
      }
    },
    {},
  );

  const selectedClient = clients.find((record) => record.id === client);
  const visibleServices = services.filter(
    (service) =>
      client === allClients ||
      (client === noClient && service.client_id === null) ||
      service.client_id === client,
  );
  const connectedTemplates = new Set(visibleServices.map((service) => service.service_template_id));
  const availableTemplates = templates.filter((template) => !connectedTemplates.has(template.id));
  const selected = new Set(selectedServices);
  const chosenServices = visibleServices.filter((service) => selected.has(service.id));
  const affectedTasks = chosenServices.reduce(
    (count, service) => count + service.eligible_tasks,
    0,
  );
  const memberNames = new Map(
    members.map((member) => [
      member.user_id,
      member.profiles?.full_name || `Member ${member.user_id.slice(0, 8)}`,
    ]),
  );
  const canSubmit =
    chosenServices.length > 0 &&
    (selectedMembers.length > 0 || leaveUnassigned) &&
    (scope === "future" || affectedTasks > 0);

  return (
    <details className={`panel ${styles.editor}`} open={Boolean(clientId)}>
      <summary className={styles.summary}>
        <strong>Assign service work</strong>
        <span>Connect a service to a client or assign their linked work in one save.</span>
      </summary>
      {!clientId && (
        <label className={`${styles.clientField} ${styles.clientPicker}`}>
          Client
          <select
            value={client}
            disabled={pending || connecting}
            onChange={(event) => {
              setClient(event.currentTarget.value);
              setSelectedServices([]);
              setShowResult(false);
            }}
            aria-describedby={`${id}-client-help`}
          >
            <option value="">Choose a client</option>
            <option value={allClients}>All clients</option>
            {clients.map((record) => (
              <option key={record.id} value={record.id}>{record.name}</option>
            ))}
            {services.some((service) => service.client_id === null) && (
              <option value={noClient}>No client</option>
            )}
          </select>
          <small id={`${id}-client-help`}>
            Choose a client to connect a service. Choose All clients to assign linked work across clients.
          </small>
        </label>
      )}
      {selectedClient && (
        <ConnectClientService
          key={selectedClient.id}
          organizationId={organizationId}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          templates={availableTemplates}
          members={members}
          hasLinkedServices={visibleServices.length > 0}
          disabled={pending}
          onPendingChange={setConnecting}
        />
      )}
      <form
        action={formAction}
        className={styles.form}
        aria-busy={pending}
        onChange={() => setShowResult(false)}
        onSubmit={() => setShowResult(true)}
        onReset={() => {
          setSelectedServices([]);
          setSelectedMembers([]);
          setLeaveUnassigned(false);
          setScope("future");
        }}
      >
        <input type="hidden" name="organization_id" value={organizationId} />
        <p className={styles.explanation}>
          {clientId
            ? "For this client, select only the service you want to assign, then choose teammates. "
            : "Choose services or projects and teammates to replace their work assignments in one save. "}
          Completed and past-period tasks stay unchanged. You can adjust individual
          tasks afterward.
        </p>
        <h3>Assign linked service work</h3>
        <fieldset disabled={pending || connecting} className={styles.controls}>
          <div className={styles.grid}>
            <fieldset className={styles.choiceGroup}>
              <legend>Linked services / projects</legend>
              <p className={styles.hint}>
                Choose one service for a specific assignment, or several to assign together.
              </p>
              <div className={styles.selectionActions}>
                <button
                  type="button"
                  className={styles.selectionButton}
                  disabled={!visibleServices.length}
                  onClick={() => {
                    setSelectedServices(visibleServices.map((service) => service.id));
                    setShowResult(false);
                  }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className={styles.selectionButton}
                  disabled={!selectedServices.length}
                  onClick={() => {
                    setSelectedServices([]);
                    setShowResult(false);
                  }}
                >
                  Clear selection
                </button>
              </div>
              <div className={styles.choiceList}>
                {visibleServices.map((service) => (
                  <label key={service.id} className={styles.choice}>
                    <input
                      type="checkbox"
                      name="project_ids"
                      value={service.id}
                      checked={selected.has(service.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedServices((current) =>
                          checked
                            ? [...current, service.id]
                            : current.filter((value) => value !== service.id),
                        );
                      }}
                    />
                    <span className={styles.choiceText}>
                      <strong>
                        {client === allClients && `${service.client_name ?? "No client"} · `}
                        {service.name}
                      </strong>
                      <small>
                        {service.eligible_tasks} eligible {service.eligible_tasks === 1 ? "task" : "tasks"}
                        {" · "}
                        {service.default_configured
                          ? `Default: ${service.default_assignees.map((memberId) => memberNames.get(memberId) ?? "Team member").join(", ") || "Unassigned"}`
                          : "Per-task assignments"}
                      </small>
                    </span>
                  </label>
                ))}
                {!visibleServices.length && (
                  <p className={styles.empty}>
                    {selectedClient
                      ? "No services are connected to this client yet. Use Connect a service above to get started."
                      : client ? "No services or projects are linked here yet." : "Choose a client to see their linked services and projects."}
                  </p>
                )}
              </div>
            </fieldset>
            <fieldset className={styles.choiceGroup}>
              <legend>Teammates</legend>
              <p className={styles.hint}>Select one person or several teammates.</p>
              <div className={styles.choiceList}>
                {members.map((member) => (
                  <label key={member.user_id} className={styles.choice}>
                    <input
                      type="checkbox"
                      name="assignees"
                      value={member.user_id}
                      checked={selectedMembers.includes(member.user_id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        if (checked) setLeaveUnassigned(false);
                        setSelectedMembers((current) =>
                          checked
                            ? [...current, member.user_id]
                            : current.filter((value) => value !== member.user_id),
                        );
                      }}
                    />
                    <Avatar
                      name={memberNames.get(member.user_id)!}
                      url={member.profiles?.avatar_url}
                    />
                    <span className={styles.choiceText}>{memberNames.get(member.user_id)}</span>
                  </label>
                ))}
                {!members.length && <p className={styles.empty}>No teammates in this workspace yet.</p>}
              </div>
              <label className={`${styles.choice} ${styles.unassigned}`}>
                <input
                  type="checkbox"
                  name="leave_unassigned"
                  value="on"
                  checked={leaveUnassigned}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setLeaveUnassigned(checked);
                    if (checked) setSelectedMembers([]);
                  }}
                />
                <span className={styles.choiceText}>
                  Leave unassigned
                  <small>Clear assignments for the selected work.</small>
                </span>
              </label>
            </fieldset>
          </div>
          <fieldset className={styles.scopeGroup}>
            <legend>Apply assignments to</legend>
            <label className={styles.choice}>
              <input
                type="radio"
                name="assignment_scope"
                value="future"
                checked={scope === "future"}
                onChange={() => setScope("future")}
              />
              <span className={styles.choiceText}>
                <strong>Selected work and future occurrences</strong>
                <small>Update eligible tasks and save defaults for each selected service or project.</small>
              </span>
            </label>
            <label className={styles.choice}>
              <input
                type="radio"
                name="assignment_scope"
                value="current"
                checked={scope === "current"}
                onChange={() => setScope("current")}
              />
              <span className={styles.choiceText}>
                <strong>Selected work only</strong>
                <small>Update eligible existing tasks; keep future assignment defaults.</small>
              </span>
            </label>
          </fieldset>
        </fieldset>
        <div className={styles.review} role="status">
          <strong>
            {chosenServices.length} {chosenServices.length === 1 ? "service / project" : "services / projects"} selected
            {" · "}{affectedTasks} existing {affectedTasks === 1 ? "task" : "tasks"} to update
          </strong>
          {scope === "future" && chosenServices.length > 0 && (
            <span>Future occurrences in the selected work will use {leaveUnassigned ? "no assignees" : "the selected teammates"}.</span>
          )}
          {!canSubmit && (
            <span>
              {scope === "current" && chosenServices.length > 0 && affectedTasks === 0
                ? "No eligible existing tasks. Choose future occurrences to save service defaults."
                : "Select services or projects and teammates, or explicitly choose Leave unassigned."}
            </span>
          )}
        </div>
        {showResult && state.error && <p className="form-error" role="alert">{state.error}</p>}
        {showResult && state.success && <p className="form-success" role="status">{state.success}</p>}
        <button className="button primary" disabled={pending || connecting || !canSubmit}>
          {pending ? "Saving assignments…" : "Save service assignments"}
        </button>
      </form>
    </details>
  );
}
