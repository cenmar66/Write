import { type Account, readJson } from "./accounts";
import type { PostRow, PublishResult } from "./types";

const API = "https://graph.threads.net";

export function threadsAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.THREADS_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "threads_basic,threads_content_publish",
    response_type: "code",
    state,
  });
  return `https://threads.net/oauth/authorize?${p}`;
}

/** Code → short-lived token → long-lived (60-day) token, plus the profile. */
export async function threadsExchange(code: string, redirectUri: string) {
  const secret = process.env.THREADS_APP_SECRET ?? "";
  const short = await readJson<{ access_token: string; user_id: string | number }>(
    await fetch(`${API}/oauth/access_token`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.THREADS_APP_ID ?? "",
        client_secret: secret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code,
      }),
    }),
    "Threads",
  );
  const long = await readJson<{ access_token: string; expires_in: number }>(
    await fetch(`${API}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`),
    "Threads",
  );
  const me = await readJson<{ id: string; username: string; threads_profile_picture_url?: string }>(
    await fetch(`${API}/v1.0/me?${new URLSearchParams({ fields: "id,username,threads_profile_picture_url", access_token: long.access_token })}`),
    "Threads",
  );
  return { token: long.access_token, expiresIn: long.expires_in, me };
}

export async function threadsRefresh(token: string) {
  return readJson<{ access_token: string; expires_in: number }>(
    await fetch(`${API}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: token })}`),
    "Threads",
  );
}

async function waitForContainer(id: string, token: string) {
  const until = Date.now() + 60_000;
  for (;;) {
    const s = await readJson<{ status?: string; error_message?: string }>(
      await fetch(`${API}/v1.0/${id}?${new URLSearchParams({ fields: "status,error_message", access_token: token })}`),
      "Threads",
    );
    if (!s.status || s.status === "FINISHED") return;
    if (s.status === "ERROR" || s.status === "EXPIRED") throw new Error(`Threads couldn't process the post: ${s.error_message ?? s.status}`);
    if (Date.now() > until) throw new Error("Threads is taking too long to process the post. Try again shortly.");
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** Posts a single post, or a thread as a chain of replies. */
export async function publishThreads(account: Account, row: PostRow): Promise<PublishResult> {
  const token = account.token!;
  const uid = account.accountId;
  const tags = row.hashtags.length ? ` #${row.hashtags[0]}` : "";
  const parts = row.format === "thread" && row.parts.length ? [...row.parts] : [row.content || row.parts.join("\n\n")];
  parts[0] = parts[0] + tags;
  const image = row.media.find((m) => m.type === "image");

  let previous: string | undefined;
  let first: string | undefined;
  for (const [i, text] of parts.entries()) {
    const params: Record<string, string> = { media_type: i === 0 && image ? "IMAGE" : "TEXT", text, access_token: token };
    if (i === 0 && image) params.image_url = image.url;
    if (previous) params.reply_to_id = previous;
    const c = await readJson<{ id: string }>(await fetch(`${API}/v1.0/${uid}/threads`, { method: "POST", body: new URLSearchParams(params) }), "Threads");
    await waitForContainer(c.id, token);
    const p = await readJson<{ id: string }>(
      await fetch(`${API}/v1.0/${uid}/threads_publish`, { method: "POST", body: new URLSearchParams({ creation_id: c.id, access_token: token }) }),
      "Threads",
    );
    previous = p.id;
    first ??= p.id;
  }
  const link = await readJson<{ permalink?: string }>(
    await fetch(`${API}/v1.0/${first}?${new URLSearchParams({ fields: "permalink", access_token: token })}`),
    "Threads",
  ).catch(() => ({ permalink: undefined }));
  return { url: link.permalink ?? null };
}
