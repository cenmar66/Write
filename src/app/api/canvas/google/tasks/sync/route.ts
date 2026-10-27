import { randomUUID } from "node:crypto";
import { localDateOf } from "@/lib/canvas/dates";
import { decide, fromRemote, toRemote, type GTask } from "@/lib/canvas/gtasks";
import { audit, getAccount, gfetch, hasScope, SCOPES } from "@/lib/canvas/google";
import { placementId, stableId } from "@/lib/canvas/ids";
import type { Task, TaskLink } from "@/lib/canvas/types";
import { fail, guard } from "../../_auth";

export const maxDuration = 60;
const API = "https://tasks.googleapis.com/tasks/v1";

/**
 * Two-way sync between linked Daily Canvas tasks and one Google Tasks list.
 * Conservative: nothing is ever deleted on either side; edits on both sides since the
 * last sync are flagged as conflicts for the person to choose.
 */
export async function POST() {
  const g = await guard(10);
  if ("denied" in g) return g.denied;
  const { supabase, userId } = g;
  const acc = await getAccount(supabase);
  if (!acc?.refresh_token_enc || !hasScope(acc, SCOPES.tasks[0])) return Response.json({ error: "Allow Google Tasks access first." }, { status: 400 });
  const listId = acc.tasks_list_id;
  if (!listId) return Response.json({ error: "Choose a Google Tasks list first." }, { status: 400 });

  const { data: prefs } = await supabase.from("canvas_preferences").select("timezone").maybeSingle();
  const tz = (prefs?.timezone as string) ?? "UTC";
  const today = localDateOf(new Date(), tz);
  const result = { exported: 0, imported: 0, updatedLocal: 0, updatedRemote: 0, conflicts: 0, errors: [] as string[] };

  try {
    // Remote snapshot of the list.
    const remote = new Map<string, GTask>();
    let pageToken: string | undefined;
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ showCompleted: "true", showHidden: "true", showDeleted: "true", maxResults: "100" });
      if (pageToken) q.set("pageToken", pageToken);
      const r = await gfetch<{ items?: GTask[]; nextPageToken?: string }>(supabase, acc, `${API}/lists/${encodeURIComponent(listId)}/tasks?${q}`);
      if (r.status === 404) return Response.json({ error: "That Google Tasks list no longer exists. Choose another." }, { status: 400 });
      for (const t of r.data.items ?? []) remote.set(t.id, t);
      pageToken = r.data.nextPageToken;
      if (!pageToken) break;
    }

    const { data: linkRows } = await supabase.from("canvas_task_links").select("*").is("deleted_at", null).eq("provider", "google_tasks");
    const links = (linkRows ?? []) as TaskLink[];
    const ids = links.map((l) => l.task_id);
    const { data: taskRows } = ids.length ? await supabase.from("canvas_tasks").select("*").in("id", ids) : { data: [] };
    const tasks = new Map(((taskRows ?? []) as Task[]).map((t) => [t.id, t]));

    const updateLink = (id: string, patch: Partial<TaskLink>) => supabase.from("canvas_task_links").update(patch).eq("id", id);

    for (const link of links) {
      const task = tasks.get(link.task_id);
      if (!task || task.deleted_at) continue;
      const r = link.external_id ? remote.get(link.external_id) : undefined;
      const d = decide(link, task, r);
      try {
        if (d.kind === "create") {
          const res = await gfetch<GTask>(supabase, acc, `${API}/lists/${encodeURIComponent(listId)}/tasks`, { method: "POST", body: JSON.stringify(toRemote(task)) });
          await updateLink(link.id, { external_id: res.data.id, list_id: listId, remote_updated: res.data.updated ?? null, remote_etag: res.data.etag ?? null, local_version_synced: task.version, state: "linked", conflict: null, last_synced_at: new Date().toISOString() });
          result.exported++;
        } else if (d.kind === "push") {
          const res = await gfetch<GTask>(supabase, acc, `${API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(link.external_id!)}`, { method: "PATCH", body: JSON.stringify(toRemote(task)) });
          await updateLink(link.id, { remote_updated: res.data.updated ?? null, remote_etag: res.data.etag ?? null, local_version_synced: task.version, state: "linked", conflict: null, last_synced_at: new Date().toISOString() });
          result.updatedRemote++;
        } else if (d.kind === "pull") {
          const patch = fromRemote(r!, task, today);
          let version = task.version;
          if (Object.keys(patch).length) {
            const { data: row, error } = await supabase.from("canvas_tasks").update(patch).eq("id", task.id).select("version").single();
            if (error) throw new Error(error.message);
            version = row.version as number;
            if (patch.status) {
              await supabase.from("canvas_task_events").insert({
                id: randomUUID(),
                task_id: task.id,
                kind: patch.status === "done" ? "completed" : "reopened",
                at: new Date().toISOString(),
                local_date: today,
                data: { source: "google_tasks" },
              });
            }
          }
          await updateLink(link.id, { remote_updated: r!.updated ?? null, remote_etag: r!.etag ?? null, local_version_synced: version, state: "linked", conflict: null, last_synced_at: new Date().toISOString() });
          result.updatedLocal++;
        } else if (d.kind === "mark") {
          await updateLink(link.id, { remote_updated: r!.updated ?? null, local_version_synced: task.version, state: "linked", conflict: null, last_synced_at: new Date().toISOString() });
        } else if (d.kind === "conflict") {
          if (link.state !== "conflict") {
            await updateLink(link.id, { state: "conflict", conflict: { remote: { title: r!.title, notes: r!.notes, status: r!.status, due: r!.due } } });
          }
          result.conflicts++;
        } else if (d.kind === "broken") {
          if (link.state !== "broken") await updateLink(link.id, { state: "broken" });
        }
      } catch (e) {
        result.errors.push(`${task.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Bring in new items from the list (for example ones Sunsama added), if enabled.
    const settings = (acc.tasks_settings ?? {}) as { importEnabled?: boolean; importSection?: string };
    if (settings.importEnabled) {
      const linked = new Set(links.map((l) => l.external_id).filter(Boolean));
      const section = ["work", "personal", "must"].includes(settings.importSection ?? "") ? settings.importSection! : "work";
      for (const r of remote.values()) {
        if (linked.has(r.id) || r.deleted || r.hidden || r.parent || r.status === "completed" || !r.title?.trim()) continue;
        // Deterministic ids: importing the same Google task twice can't make two tasks.
        const taskId = stableId("gtask", userId, r.id);
        const { data: existing } = await supabase.from("canvas_tasks").select("id").eq("id", taskId).maybeSingle();
        if (existing) continue;
        const { data: row, error } = await supabase
          .from("canvas_tasks")
          .insert({ id: taskId, section, title: r.title.trim(), notes: r.notes ?? "", due_date: r.due ? r.due.slice(0, 10) : null, origin_date: today, source: "google_tasks" })
          .select("version")
          .single();
        if (error) {
          result.errors.push(`Import "${r.title}": ${error.message}`);
          continue;
        }
        await supabase.from("canvas_task_placements").insert({ id: placementId(taskId, today), task_id: taskId, date: today, section, position: 900 + result.imported });
        await supabase.from("canvas_task_events").insert({ id: stableId("created", taskId), task_id: taskId, kind: "created", at: new Date().toISOString(), local_date: today, data: { source: "google_tasks" } });
        await supabase.from("canvas_task_links").insert({
          id: stableId("link", taskId),
          task_id: taskId,
          provider: "google_tasks",
          list_id: listId,
          external_id: r.id,
          remote_updated: r.updated ?? null,
          remote_etag: r.etag ?? null,
          local_version_synced: row.version,
          state: "linked",
          last_synced_at: new Date().toISOString(),
        });
        result.imported++;
      }
    }

    await supabase.from("canvas_google_accounts").update({ last_tasks_sync: new Date().toISOString(), last_error: result.errors[0] ?? null }).eq("user_id", userId);
    await audit(supabase, "google_tasks", "sync", result.errors.length ? "error" : "ok", { ...result, message: result.errors[0] });
    return Response.json(result);
  } catch (e) {
    await audit(supabase, "google_tasks", "sync", "error", { message: e instanceof Error ? e.message : String(e) });
    await supabase.from("canvas_google_accounts").update({ last_error: e instanceof Error ? e.message : String(e) }).eq("user_id", userId);
    return fail(e);
  }
}
