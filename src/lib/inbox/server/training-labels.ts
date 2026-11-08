// SaneBox-style Gmail labels. InboxSatori creates "InboxSatori/Black Hole" and one
// "InboxSatori/<Category>" label per category in the user's Gmail. Moving mail into one
// of them in Gmail (web or phone app, one email or many) is the user's own explicit choice:
//   • into Black Hole   → that sender goes to the Black Hole (archive, never trash; undo kept)
//   • out of Black Hole, back to the inbox → the sender is brought back
//   • into a category   → the email is re-filed and InboxSatori learns the sender
// Only the user's label moves trigger this: never AI, rules or the assistant.

import type { Db } from "../db";
import { providerFor } from "../mail/provider";
import type { AccountRow } from "../types";
import { audit } from "./workspace";

export const BLACK_HOLE_LABEL = "Black Hole";

export type TrainingMap = NonNullable<AccountRow["settings"]["training_labels"]>;

/** One stored message whose Gmail labels changed during a sync. */
export interface LabelChange {
  id: string;
  workspace_id: string;
  from_email: string;
  is_sent: boolean;
  added: string[];
  removed: string[];
  labels: string[];
}

/** Creates (or finds) the labels in the mailbox and remembers what each one means. */
export async function setupTrainingLabels(db: Db, admin: Db | null, acc: AccountRow): Promise<TrainingMap> {
  const p = await providerFor(acc, { admin });
  if (!p.capabilities(acc).modify) throw new Error("Creating Gmail labels needs the Organize permission for this mailbox.");
  const { data: cats } = await db.from("ip_categories").select("key,name,hidden").eq("workspace_id", acc.workspace_id).order("position");
  const map: TrainingMap = {};
  map[await p.ensureLabel(acc, BLACK_HOLE_LABEL)] = "black_hole";
  for (const c of cats ?? []) {
    if (c.hidden || c.key === "review") continue;
    map[await p.ensureLabel(acc, String(c.name))] = `category:${c.key}`;
  }
  await db.from("ip_accounts").update({ settings: { ...(acc.settings ?? {}), training_labels: map } }).eq("id", acc.id);
  return map;
}

/** Stops treating label moves as commands (the labels stay in Gmail, untouched). */
export async function disableTrainingLabels(db: Db, acc: AccountRow) {
  const settings = { ...(acc.settings ?? {}) };
  delete settings.training_labels;
  await db.from("ip_accounts").update({ settings }).eq("id", acc.id);
}

/** Acts on the user's label moves found during a sync. Returns what it did. */
export async function applyLabelChanges(db: Db, admin: Db | null, acc: AccountRow, changes: LabelChange[]) {
  const map = acc.settings?.training_labels;
  const done = { blackHoled: [] as string[], broughtBack: [] as string[], filed: 0 };
  if (!map || !changes.length) return done;
  const { blackHoleSender } = await import("./black-hole");
  const handledSenders = new Set<string>();
  for (const c of changes) {
    if (c.is_sent || !c.from_email) continue;
    const key = `${c.workspace_id}|${c.from_email}`;
    const { data: sender } = await db.from("ip_senders").select("id,workspace_id,email,blocked").eq("workspace_id", c.workspace_id).eq("email", c.from_email).maybeSingle();

    // Into the Black Hole label: send the sender there (once per sender per sync).
    if (c.added.some((l) => map[l] === "black_hole")) {
      if (sender && !sender.blocked && !handledSenders.has(key)) {
        handledSenders.add(key);
        const r = await blackHoleSender({ db, admin }, sender);
        done.blackHoled.push(sender.email);
        await audit(db, c.workspace_id, "user", "sender.black_hole", sender.email, { via: "gmail_label", affected: r.affected, archived: r.archived });
      }
      continue;
    }
    // Moved back out of the Black Hole label into the inbox: bring the sender back.
    if (c.removed.some((l) => map[l] === "black_hole") && c.labels.includes("INBOX")) {
      if (sender?.blocked && !handledSenders.has(key)) {
        handledSenders.add(key);
        await db.from("ip_senders").update({ blocked: false }).eq("id", sender.id);
        await db.from("ip_messages").update({ done_at: null }).eq("id", c.id);
        done.broughtBack.push(sender.email);
        await audit(db, c.workspace_id, "user", "sender.update", sender.email, { blocked: false, via: "gmail_label" });
      }
      continue;
    }
    // Into a category label: re-file this email and learn the sender.
    const cat = c.added.map((l) => map[l]).find((v) => v?.startsWith("category:"));
    if (cat) {
      const value = cat.slice(9);
      const { data: cur } = await db.from("ip_classifications").select("category").eq("message_id", c.id).maybeSingle();
      await db.from("ip_messages").update({ category: value }).eq("id", c.id);
      if (cur) await db.from("ip_classifications").update({ category: value, user_corrected: true, source: "user", confidence: 1 }).eq("message_id", c.id);
      await db.from("ip_classification_feedback").insert({ workspace_id: c.workspace_id, message_id: c.id, sender_email: c.from_email, field: "category", old_value: cur?.category ?? null, new_value: value });
      if (sender) await db.from("ip_senders").update({ default_category: value }).eq("id", sender.id);
      await audit(db, c.workspace_id, "user", "classification.correct", c.id, { field: "category", to: value, via: "gmail_label" });
      done.filed++;
    }
  }
  return done;
}
