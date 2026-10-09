"use client";

import { useActionState, useId, useState } from "react";
import { connectClientService, type WorkState } from "@/app/work-actions";
import { Avatar } from "@/components/avatar";
import type { Directory } from "@/lib/data/queries";
import formStyles from "./service-assignment-editor.module.css";
import styles from "./connect-client-service.module.css";

export function ConnectClientService({
  organizationId,
  clientId,
  clientName,
  templates,
  members,
  hasLinkedServices,
  disabled = false,
  onPendingChange,
}: {
  organizationId: string;
  clientId: string;
  clientName: string;
  templates: { id: string; name: string }[];
  members: Directory["members"];
  hasLinkedServices: boolean;
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const id = useId();
  const [templateId, setTemplateId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [leaveUnassigned, setLeaveUnassigned] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [state, formAction, pending] = useActionState<WorkState, FormData>(
    async (previous, form) => {
      onPendingChange(true);
      try {
        return await connectClientService(previous, form);
      } catch {
        return { error: "Unable to connect this service. Please try again." };
      } finally {
        onPendingChange(false);
      }
    },
    {},
  );
  const canSubmit =
    templates.some((template) => template.id === templateId) &&
    (selectedMembers.length > 0 || leaveUnassigned);

  return (
    <details className={styles.section} open={!hasLinkedServices} aria-labelledby={`${id}-heading`}>
      <summary id={`${id}-heading`} className={styles.summary}>
        {hasLinkedServices ? "Connect another service" : "Connect a service to this client"}
      </summary>
      <p className={styles.description}>
        Connect an existing service template to {clientName}, then assign its current
        and future recurring work to your selected teammates.
      </p>
      <form
        action={formAction}
        className={formStyles.form}
        aria-busy={pending}
        onChange={() => setShowResult(false)}
        onSubmit={() => setShowResult(true)}
        onReset={() => {
          setTemplateId("");
          setSelectedMembers([]);
          setLeaveUnassigned(false);
        }}
      >
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="client_id" value={clientId} />
        <fieldset disabled={pending || disabled} className={formStyles.controls}>
          <label className={formStyles.clientField}>
            Available service template
            <select
              name="service_template_id"
              value={templateId}
              onChange={(event) => setTemplateId(event.currentTarget.value)}
              required
            >
              <option value="">Choose an existing service</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <small>Services already connected to this client appear in the linked work below.</small>
          </label>
          {!templates.length && (
            <p className={formStyles.hint}>No additional existing service templates are available to connect.</p>
          )}
          <fieldset className={formStyles.choiceGroup}>
            <legend>Assign this service to</legend>
            <p className={formStyles.hint}>Select one person or several teammates.</p>
            <div className={formStyles.choiceList}>
              {members.map((member) => {
                const name = member.profiles?.full_name || `Member ${member.user_id.slice(0, 8)}`;
                return (
                  <label key={member.user_id} className={formStyles.choice}>
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
                    <Avatar name={name} url={member.profiles?.avatar_url} />
                    <span className={formStyles.choiceText}>{name}</span>
                  </label>
                );
              })}
              {!members.length && <p className={formStyles.empty}>No teammates in this workspace yet.</p>}
            </div>
            <label className={`${formStyles.choice} ${formStyles.unassigned}`}>
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
              <span className={formStyles.choiceText}>
                Leave unassigned
                <small>Connect this service without assigned teammates.</small>
              </span>
            </label>
          </fieldset>
        </fieldset>
        {showResult && state.error && <p className="form-error" role="alert">{state.error}</p>}
        {showResult && state.success && <p className="form-success" role="status">{state.success}</p>}
        <button className="button primary" disabled={pending || disabled || !canSubmit}>
          {pending ? "Connecting service…" : "Connect service and assign work"}
        </button>
      </form>
    </details>
  );
}
