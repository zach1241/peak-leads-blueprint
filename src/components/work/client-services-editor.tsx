import { changeClientServiceStatus } from "@/app/client-service-actions";
export function ClientServicesEditor({ clientId, services, canAdmin }: {
  clientId: string;
  services: { id: string; name: string; status: string }[];
  canAdmin: boolean;
}) {
  if (!services.length) return <span>No services linked</span>;
  return <div style={{ display: "grid", gap: "0.4rem" }}>
    {services.map(service => <form key={service.id} action={changeClientServiceStatus}
      style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="project_id" value={service.id} />
      <span style={{ minWidth: "10rem" }}>{service.name}</span>
      {canAdmin && ["active", "on_hold"].includes(service.status)
        ? <><select name="status" defaultValue={service.status} aria-label={`Status of ${service.name}`}>
          <option value="active">Active</option>
          <option value="on_hold">On hold</option>
        </select><button type="submit" className="button secondary">Save</button></>
        : <small>{service.status.replaceAll("_", " ")}</small>}
    </form>)}
    {canAdmin && <small>Pausing a service hides its generated work from the active deliverables queue without deleting history.</small>}
  </div>;
}
