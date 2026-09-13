// Local-only real Auth + PostgREST integration test. Never reads .env.local.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const status = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const url = status.API_URL;
assert.equal(
  new URL(url).hostname,
  "127.0.0.1",
  "Tests must use local Supabase",
);
assert.equal(new URL(url).port, "54321");
const admin = createClient(url, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const suffix = randomUUID().slice(0, 8);
const password = `${randomUUID()}aA1!`;
const users = [];
const organizations = [];
let checks = 0;
const ok = (value, message) => {
  assert.ok(value, message);
  checks++;
  console.log(`PASS ${message}`);
};
async function unwrap(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
try {
  for (const name of ["owner-a", "member-a", "owner-b"]) {
    const data = await unwrap(
      await admin.auth.admin.createUser({
        email: `${name}-${suffix}@example.test`,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      }),
    );
    users.push(data.user);
  }
  for (const name of ["a", "b"])
    organizations.push(
      await unwrap(
        await admin
          .from("organizations")
          .insert({
            name: `API test ${name}`,
            slug: `api-test-${name}-${suffix}`,
          })
          .select()
          .single(),
      ),
    );
  const [a, b] = organizations;
  await unwrap(
    await admin.from("organization_members").insert([
      { organization_id: a.id, user_id: users[0].id, role: "owner" },
      { organization_id: a.id, user_id: users[1].id, role: "member" },
      { organization_id: b.id, user_id: users[2].id, role: "owner" },
    ]),
  );
  const member = createClient(url, status.ANON_KEY, {
    auth: { persistSession: false },
  });
  await unwrap(
    await member.auth.signInWithPassword({ email: users[1].email, password }),
  );
  ok(
    (await member.auth.getUser()).data.user?.id === users[1].id,
    "real Auth sign-in validates member",
  );
  const client = await unwrap(
    await admin
      .from("clients")
      .insert({
        organization_id: a.id,
        name: "Local client",
        slug: `client-${suffix}`,
      })
      .select()
      .single(),
  );
  const project = await unwrap(
    await member
      .from("projects")
      .insert({
        organization_id: a.id,
        name: "Local project",
        client_id: client.id,
        created_by: users[1].id,
      })
      .select()
      .single(),
  );
  const args = {
    p_organization_id: a.id,
    p_id: null,
    p_title: "Integration task",
    p_description: "Local-only fixture",
    p_status: "todo",
    p_priority: "high",
    p_due_date: "2026-09-15",
    p_project_id: project.id,
    p_client_id: client.id,
    p_assignees: [users[0].id, users[1].id],
  };
  const taskId = await unwrap(await member.rpc("save_task", args));
  ok(Boolean(taskId), "member atomically creates task with two assignees");
  const rows = await unwrap(
    await member
      .from("tasks")
      .select(
        "*,projects(name),clients(name),task_assignees(user_id),assigned:task_assignees(user_id)",
      )
      .eq("organization_id", a.id)
      .eq("assigned.user_id", users[1].id)
      .not("assigned", "is", null),
  );
  ok(
    rows.length === 1 &&
      rows[0].task_assignees.length === 2 &&
      rows[0].projects.name === "Local project",
    "filtered task list preserves all assignees and joins",
  );
  const directory = await unwrap(
    await member
      .from("organization_members")
      .select("*,profiles(*)")
      .eq("organization_id", a.id),
  );
  ok(
    directory.length === 2 && directory.every((m) => m.profiles?.full_name),
    "team/profile embedding works",
  );
  const count = await member
    .from("tasks")
    .select("id,task_assignees!inner(user_id)", { count: "exact", head: true })
    .eq("organization_id", a.id)
    .eq("task_assignees.user_id", users[1].id)
    .not("status", "in", "(done,cancelled)");
  ok(
    !count.error && count.count === 1,
    "dashboard counts use assignment join correctly",
  );
  const forbidden = await member.rpc("save_task", {
    ...args,
    p_title: "Must roll back",
    p_assignees: [users[2].id],
  });
  ok(
    forbidden.error?.code === "23503",
    "API rejects cross-organization assignee",
  );
  ok(
    (
      await unwrap(
        await member.from("tasks").select("id").eq("title", "Must roll back"),
      )
    ).length === 0,
    "failed API save leaves no partial task",
  );
  await unwrap(
    await member.rpc("save_task", {
      ...args,
      p_id: taskId,
      p_title: "Completed integration task",
      p_status: "done",
      p_assignees: [users[1].id],
    }),
  );
  const comment = await unwrap(
    await member
      .from("comments")
      .insert({
        organization_id: a.id,
        task_id: taskId,
        author_id: users[1].id,
        body: "Verified comment",
      })
      .select("*,profiles(full_name)")
      .single(),
  );
  ok(
    comment.profiles.full_name === "member-a",
    "comments save and author join works",
  );
  const events = await unwrap(
    await member.from("activity_logs").select("*").eq("organization_id", a.id),
  );
  ok(
    events.some(
      (e) => e.action === "completed" && e.actor_id === users[1].id,
    ) && events.some((e) => e.entity_type === "comment"),
    "database triggers generate authenticated activity",
  );
  ok(
    Boolean(
      (
        await member
          .from("organization_members")
          .update({ role: "owner" })
          .eq("user_id", users[1].id)
          .select()
      ).data?.length === 0,
    ),
    "member cannot promote own role through API",
  );
  ok(
    Boolean(
      (
        await member
          .from("clients")
          .insert({ organization_id: a.id, name: "Denied", slug: "denied" })
      ).error,
    ),
    "member cannot create admin-only client",
  );
  ok(
    Boolean(
      (
        await member.from("activity_logs").insert({
          organization_id: a.id,
          entity_type: "task",
          entity_id: taskId,
          action: "forged",
        })
      ).error,
    ),
    "API cannot forge audit logs",
  );
  const outsider = createClient(url, status.ANON_KEY, {
    auth: { persistSession: false },
  });
  await unwrap(
    await outsider.auth.signInWithPassword({ email: users[2].email, password }),
  );
  ok(
    (await unwrap(await outsider.from("tasks").select("*").eq("id", taskId)))
      .length === 0,
    "organization B cannot read A task by ID",
  );
  ok(
    (
      await unwrap(
        await outsider
          .from("tasks")
          .update({ title: "Hijacked" })
          .eq("id", taskId)
          .select(),
      )
    ).length === 0,
    "organization B cannot update A task",
  );
  const owner = createClient(url, status.ANON_KEY, {
    auth: { persistSession: false },
  });
  await unwrap(
    await owner.auth.signInWithPassword({ email: users[0].email, password }),
  );
  const service = await unwrap(
    await owner
      .from("service_templates")
      .insert({
        organization_id: a.id,
        code: "test-delivery",
        name: "Test delivery",
      })
      .select()
      .single(),
  );
  await unwrap(
    await owner
      .from("service_deliverables")
      .insert({
        organization_id: a.id,
        service_template_id: service.id,
        code: "pages",
        name: "Test pages",
        cadence: "monthly",
        target_min: 2,
        target_max: 3,
        unit: "pages",
      }),
  );
  await unwrap(
    await owner
      .from("projects")
      .update({ service_template_id: service.id, status: "active" })
      .eq("id", project.id),
  );
  const responsibility = await unwrap(
    await owner
      .from("managed_responsibilities")
      .insert({
        organization_id: a.id,
        client_id: client.id,
        project_id: project.id,
        source_key: "test:monitoring",
        title: "Test monitoring",
      })
      .select()
      .single(),
  );
  ok(
    (await unwrap(
      await member.rpc("generate_current_deliverables", {
        p_organization_id: a.id,
      }),
    )) === 1,
    "member generates current delivery through RLS API",
  );
  ok(
    (await unwrap(
      await member.rpc("generate_current_deliverables", {
        p_organization_id: a.id,
      }),
    )) === 0,
    "API recurrence rerun is idempotent",
  );
  const delivery = await unwrap(
    await member
      .from("tasks")
      .select(
        "*,clients(name),projects(name),service_deliverables(cadence,name)",
      )
      .not("deliverable_definition_id", "is", null)
      .single(),
  );
  ok(
    delivery.target_min === 2 &&
      delivery.target_max === 3 &&
      delivery.service_deliverables.name === "Test pages",
    "delivery API joins preserve target range",
  );
  await unwrap(
    await member
      .from("tasks")
      .update({ completed_quantity: 2 })
      .eq("id", delivery.id),
  );
  ok(
    (
      await unwrap(
        await member
          .from("tasks")
          .select("status")
          .eq("id", delivery.id)
          .single(),
      )
    ).status === "done",
    "API quantity completes numerical task",
  );
  await unwrap(
    await member
      .from("tasks")
      .update({ completed_quantity: 0 })
      .eq("id", delivery.id),
  );
  ok(
    (await outsider.from("managed_responsibilities").select("id")).data
      .length === 0,
    "API responsibilities are tenant isolated",
  );
  if (process.env.TEST_APP_URL) {
    const app = process.env.TEST_APP_URL;
    assert.equal(
      app,
      "http://localhost:3001",
      "Page tests must use the isolated local app",
    );
    const jar = new Map();
    const ssr = createServerClient(url, status.ANON_KEY, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (values) =>
          values.forEach(({ name, value }) => jar.set(name, value)),
      },
    });
    await unwrap(
      await ssr.auth.signInWithPassword({ email: users[1].email, password }),
    );
    const headers = () => ({
      cookie: [...jar]
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("; "),
    });
    async function page(path, expected) {
      const response = await fetch(`${app}${path}`, {
        headers: headers(),
        redirect: "manual",
      });
      const html = await response.text();
      ok(
        response.status === 200 &&
          html.includes(expected) &&
          !html.includes("<h1>Something didn’t load."),
        `SSR ${path} renders authorized data`,
      );
      return html;
    }
    await page("/dashboard", "Active Clients");
    await page("/delivery", "Managed responsibilities");
    await page("/tasks", "Completed integration task");
    await page("/clients", "Local client");
    await page("/projects", "Local project");
    await page("/team", "member-a");
    await page("/activity", "Completed integration task");
    await page("/settings", "Your profile");
    await page(`/tasks/${taskId}`, "Verified comment");
    await page(`/clients/${client.id}`, "Local client");
    await page(`/projects/${project.id}`, "Local project");
    const decode = (value) =>
      value
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">");
    async function submit(path, marker, values) {
      const response = await fetch(`${app}${path}`, { headers: headers() });
      const html = await response.text();
      const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(
        (m) => m[0],
      );
      const form = forms.find((f) => f.includes(marker));
      assert.ok(form, `Form ${marker} exists`);
      const body = new FormData();
      for (const input of form.matchAll(/<input\b[^>]*>/g)) {
        const name = input[0].match(/name="([^"]*)"/)?.[1];
        const value = input[0].match(/value="([^"]*)"/)?.[1];
        if (name?.startsWith("$ACTION"))
          body.append(decode(name), decode(value ?? ""));
      }
      assert.ok([...body.keys()].length, "Server Action metadata is rendered");
      for (const [name, value] of Object.entries(values))
        for (const entry of Array.isArray(value) ? value : [value])
          body.append(name, entry);
      return fetch(`${app}${path}`, {
        method: "POST",
        headers: { ...headers(), Origin: app },
        body,
        redirect: "manual",
      });
    }
    const saved = await submit("/tasks/new", 'name="title"', {
      id: "",
      title: "Server action task",
      description: "Saved through Next.js",
      status: "todo",
      priority: "urgent",
      due_date: "",
      project_id: project.id,
      client_id: client.id,
      assignees: [users[1].id],
    });
    ok(
      saved.status === 303 &&
        saved.headers.get("location")?.includes("/tasks/"),
      "task create Server Action redirects to detail",
    );
    const newId = saved.headers.get("location").split("/").pop();
    const edited = await submit(`/tasks/${newId}`, 'name="title"', {
      id: newId,
      title: "Server action edited",
      description: "Updated through Next.js",
      status: "review",
      priority: "low",
      due_date: "",
      project_id: project.id,
      client_id: client.id,
      assignees: [users[1].id],
    });
    ok(edited.status === 303, "task edit Server Action succeeds");
    await submit(`/tasks/${newId}`, 'name="body"', {
      task_id: newId,
      body: "Server action comment",
    });
    await page(`/tasks/${newId}`, "Server action comment");
    await unwrap(
      await ssr.auth.signInWithPassword({ email: users[0].email, password }),
    );
    const createdClient = await submit("/clients/new", 'name="slug"', {
      id: "",
      name: "Action client",
      slug: `action-${suffix}`,
      status: "active",
      website: "https://example.com",
      primary_contact_name: "Test contact",
      primary_contact_email: "contact@example.test",
      notes: "Local-only fixture",
    });
    ok(
      createdClient.status === 303,
      "owner client create Server Action succeeds",
    );
    const clientId = createdClient.headers.get("location").split("/").pop();
    const editedClient = await submit(`/clients/${clientId}`, 'name="slug"', {
      id: clientId,
      name: "Action client edited",
      slug: `action-${suffix}`,
      status: "inactive",
      website: "https://example.com",
      primary_contact_name: "Test contact",
      primary_contact_email: "contact@example.test",
      notes: "Edited fixture",
    });
    ok(editedClient.status === 303, "owner client edit Server Action succeeds");
    const createdProject = await submit("/projects/new", 'name="start_date"', {
      id: "",
      name: "Action project",
      status: "planned",
      client_id: clientId,
      start_date: "2026-09-01",
      due_date: "2026-09-30",
      description: "Local fixture",
    });
    ok(createdProject.status === 303, "project create Server Action succeeds");
    const projectId = createdProject.headers.get("location").split("/").pop();
    const editedProject = await submit(
      `/projects/${projectId}`,
      'name="start_date"',
      {
        id: projectId,
        name: "Action project edited",
        status: "active",
        client_id: clientId,
        start_date: "2026-09-01",
        due_date: "2026-10-01",
        description: "Edited fixture",
      },
    );
    ok(editedProject.status === 303, "project edit Server Action succeeds");
    await page("/delivery", "Test pages");
    await page(`/tasks/${delivery.id}`, "Delivered quantity");
    const quantitySaved = await submit(
      `/tasks/${delivery.id}`,
      'name="quantity"',
      { id: delivery.id, quantity: "2" },
    );
    ok(
      quantitySaved.status === 200 &&
        (
          await unwrap(
            await member
              .from("tasks")
              .select("completed_quantity,status")
              .eq("id", delivery.id)
              .single(),
          )
        ).status === "done",
      "quantity Server Action completes delivery",
    );
    const responsibilitySaved = await submit(
      "/delivery",
      'name="status_note"',
      {
        id: responsibility.id,
        status: "blocked",
        status_note: "Local action check",
      },
    );
    ok(
      responsibilitySaved.status === 200 &&
        (
          await unwrap(
            await member
              .from("managed_responsibilities")
              .select("status")
              .eq("id", responsibility.id)
              .single(),
          )
        ).status === "blocked",
      "responsibility Server Action updates status separately",
    );
    const signedOut = await submit("/settings", "Sign out", {});
    ok(
      signedOut.status === 303 &&
        signedOut.headers.get("location")?.includes("/login"),
      "logout Server Action redirects to login",
    );
    ok(
      signedOut.headers.getSetCookie().some((c) => c.includes("Max-Age=0")),
      "logout Server Action clears auth cookies",
    );
    const noSession = await fetch(`${app}/dashboard`, { redirect: "manual" });
    ok(
      noSession.status === 307 &&
        noSession.headers.get("location")?.includes("/login"),
      "signed-out dashboard redirects to login",
    );
  }
  await unwrap(await member.auth.signOut({ scope: "local" }));
  ok(
    !(await member.auth.getUser()).data.user,
    "real Auth logout clears the session",
  );
  console.log(`${checks} API integration checks passed.`);
} finally {
  // Remove only generated fixtures. Drop work before org to honor RESTRICT links.
  for (const org of organizations) {
    await admin.from("tasks").delete().eq("organization_id", org.id);
    await admin
      .from("managed_responsibilities")
      .delete()
      .eq("organization_id", org.id);
    await admin.from("projects").delete().eq("organization_id", org.id);
    await admin
      .from("service_deliverables")
      .delete()
      .eq("organization_id", org.id);
    await admin
      .from("service_templates")
      .delete()
      .eq("organization_id", org.id);
    await admin.from("clients").delete().eq("organization_id", org.id);
    const result = await admin.from("organizations").delete().eq("id", org.id);
    if (result.error)
      console.error(
        "Fixture organization cleanup failed:",
        result.error.message,
      );
  }
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error)
      console.error("Fixture user cleanup failed:", result.error.message);
  }
}
