import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import type { Directory, taskList } from "@/lib/data/queries";

import styles from "./grouped-task-list.module.css";
import { TaskTable } from "./task-table";

type Tasks = Awaited<ReturnType<typeof taskList>>["rows"];

type ServiceGroup = {
  id: string;
  name: string;
  href?: string;
  tasks: Tasks;
};

type ClientGroup = {
  id: string;
  name: string;
  tasks: Tasks;
  services: Map<string, ServiceGroup>;
};

function alphabetically(
  first: { id: string; name: string },
  second: { id: string; name: string },
) {
  return (
    first.name.localeCompare(second.name, "en", { sensitivity: "base" }) ||
    first.id.localeCompare(second.id, "en")
  );
}

function TaskCounts({ tasks }: { tasks: Tasks }) {
  const done = tasks.filter((task) => task.status === "done").length;
  const cancelled = tasks.filter((task) => task.status === "cancelled").length;
  const open = tasks.length - done - cancelled;

  return (
    <span className={styles.counts}>
      <span className={styles.total}>
        {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
      </span>
      <span>{open} open</span>
      <span>{done} done</span>
      {cancelled > 0 && <span>{cancelled} cancelled</span>}
    </span>
  );
}

export function GroupedTaskList({
  tasks,
  members,
  assignmentOrganizationId,
  editableStatus = false,
  statusUserId,
  emptyDescription = "Create your first task or adjust your filters.",
  expandAll = false,
}: {
  tasks: Tasks;
  members: Directory["members"];
  assignmentOrganizationId?: string;
  editableStatus?: boolean;
  statusUserId?: string;
  emptyDescription?: string;
  expandAll?: boolean;
}) {
  if (!tasks.length) {
    return (
      <EmptyState icon="tasks" title="No tasks to show">
        {emptyDescription}
      </EmptyState>
    );
  }

  const clients = new Map<string, ClientGroup>();

  for (const task of tasks) {
    const clientId = task.client_id ?? "no-client";
    let client = clients.get(clientId);
    if (!client) {
      client = {
        id: clientId,
        name: task.clients?.name?.trim() || "No client",
        tasks: [],
        services: new Map(),
      };
      clients.set(clientId, client);
    }
    client.tasks.push(task);

    const serviceId = task.project_id ?? "general-work";
    let service = client.services.get(serviceId);
    if (!service) {
      service = {
        id: serviceId,
        name: task.projects?.name?.trim() || "General work",
        href:
          task.project_id && task.projects?.name?.trim()
            ? `/projects/${task.project_id}`
            : undefined,
        tasks: [],
      };
      client.services.set(serviceId, service);
    }
    service.tasks.push(task);
  }

  return (
    <div className={styles.groups}>
      {Array.from(clients.values())
        .sort(alphabetically)
        .map((client, clientIndex) => (
          <details
            className={styles.client}
            key={client.id}
            open={expandAll || clientIndex === 0}
          >
            <summary className={styles.clientSummary}>
              <span className={styles.clientIdentity}>
                <span className={styles.caret} aria-hidden="true" />
                <span className={styles.clientIcon}>
                  <Icon name="clients" />
                </span>
                <span className={styles.clientText}>
                  <span className={styles.clientName}>{client.name}</span>
                  <span className={styles.serviceCount}>
                    {client.services.size}{" "}
                    {client.services.size === 1 ? "service" : "services"}
                  </span>
                </span>
              </span>
              <TaskCounts tasks={client.tasks} />
            </summary>

            {client.id !== "no-client" && (
              <div className={styles.clientTools}>
                <Link
                  className={styles.clientLink}
                  href={`/clients/${client.id}`}
                >
                  Client overview
                  <Icon name="arrow" />
                </Link>
              </div>
            )}

            <div className={styles.services}>
              {Array.from(client.services.values())
                .sort(alphabetically)
                .map((service, serviceIndex) => {
                  const headingId = `task-service-${clientIndex}-${serviceIndex}`;

                  return (
                    <details
                      className={styles.service}
                      key={service.id}
                      aria-labelledby={headingId}
                      open={expandAll || serviceIndex === 0}
                    >
                      <summary className={styles.serviceSummary}>
                        <h3 id={headingId}>
                          <span className={styles.caret} aria-hidden="true" />
                          <Icon name="projects" />
                          {service.href ? (
                            <Link
                              className={styles.serviceLink}
                              href={service.href}
                            >
                              {service.name}
                            </Link>
                          ) : (
                            service.name
                          )}
                        </h3>
                        <TaskCounts tasks={service.tasks} />
                      </summary>
                      <TaskTable
                        tasks={service.tasks}
                        members={members}
                        assignmentOrganizationId={assignmentOrganizationId}
                        editableStatus={editableStatus}
                        statusUserId={statusUserId}
                        hideContext
                      />
                    </details>
                  );
                })}
            </div>
          </details>
        ))}
    </div>
  );
}
