"use client";

import { useState } from "react";
import {
  changeTaskFilterClient,
  serviceFilterProjects,
  type TaskFilterClient,
  type TaskFilterProject,
} from "@/lib/data/task-view-models";

export function TaskContextFilters({
  clients,
  projects,
  client,
  project,
}: {
  clients: TaskFilterClient[];
  projects: TaskFilterProject[];
  client: string;
  project: string;
}) {
  const [selection, setSelection] = useState({ client, project });
  const clientNames = new Map(clients.map((item) => [item.id, item.name]));
  const services = serviceFilterProjects(projects, selection.client);

  return (
    <>
      <label>
        Client
        <select
          name="client"
          value={selection.client}
          onChange={(event) => setSelection(changeTaskFilterClient(event.target.value))}
        >
          <option value="">All clients</option>
          {clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>
        Service / project
        <select
          name="project"
          value={selection.project}
          onChange={(event) => setSelection((current) => ({ ...current, project: event.target.value }))}
        >
          <option value="">All services</option>
          {services.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}{item.client_id ? ` · ${clientNames.get(item.client_id) || "Client"}` : ""}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
