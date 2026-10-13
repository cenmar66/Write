import { type Account, readJson } from "./accounts";
import type { MediaItem, PostRow, PublishResult } from "./types";

const VERSION = process.env.LINKEDIN_API_VERSION ?? "202608";
const API = "https://api.linkedin.com";

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "LinkedIn-Version": VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
  "Content-Type": "application/json",
});

/** Company-page scopes need LinkedIn's approval, so they are only requested once you turn them on. */
export function linkedinScopes(): string {
  const base = ["openid", "profile", "w_member_social"];
  if (process.env.LINKEDIN_ORGANIZATION_POSTING === "true") base.push("w_organization_social", "r_organization_social");
  return base.join(" ");
}

export function linkedinAuthUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    state,
    scope: linkedinScopes(),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string };

export async function linkedinExchange(code: string, redirectUri: string): Promise<TokenResponse> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  return readJson<TokenResponse>(res, "LinkedIn");
}

export async function linkedinRefresh(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  return readJson<TokenResponse>(res, "LinkedIn");
}

export type LinkedInAuthor = { urn: string; name: string; type: "person" | "organization" };

/** You, plus any company pages you administer (when page posting is approved). */
export async function linkedinAuthors(token: string): Promise<{ me: { sub: string; name: string; picture?: string }; authors: LinkedInAuthor[] }> {
  const me = await readJson<{ sub: string; name: string; picture?: string }>(
    await fetch(`${API}/v2/userinfo`, { headers: { Authorization: `Bearer ${token}` } }),
    "LinkedIn",
  );
  const authors: LinkedInAuthor[] = [{ urn: `urn:li:person:${me.sub}`, name: `${me.name} (personal profile)`, type: "person" }];
  if (process.env.LINKEDIN_ORGANIZATION_POSTING === "true") {
    const acls = await readJson<{ elements?: { organization: string }[] }>(
      await fetch(`${API}/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`, { headers: headers(token) }),
      "LinkedIn",
    ).catch(() => ({ elements: [] }));
    for (const el of acls.elements ?? []) {
      const id = el.organization.split(":").pop();
      const org = await readJson<{ localizedName?: string }>(
        await fetch(`${API}/rest/organizations/${id}`, { headers: headers(token) }),
        "LinkedIn",
      ).catch(() => ({ localizedName: undefined }));
      authors.push({ urn: el.organization, name: org.localizedName ?? `Company page ${id}`, type: "organization" });
    }
  }
  return { me, authors };
}

// LinkedIn's "little text" format treats these characters as markup, so they must be escaped.
export const escapeLittle = (s: string) => s.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);

async function uploadImage(token: string, owner: string, item: MediaItem): Promise<string> {
  const init = await readJson<{ value: { uploadUrl: string; image: string } }>(
    await fetch(`${API}/rest/images?action=initializeUpload`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    }),
    "LinkedIn",
  );
  const bytes = await (await fetch(item.url)).arrayBuffer();
  const put = await fetch(init.value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: bytes });
  if (!put.ok) throw new Error(`LinkedIn: image upload failed (HTTP ${put.status}).`);
  return init.value.image;
}

export async function publishLinkedIn(account: Account, post: PostRow): Promise<PublishResult> {
  const token = account.token!;
  const author = (account.meta.author_urn as string) || `urn:li:person:${account.accountId}`;
  const text = post.format === "single" ? post.content : post.content || post.parts.join("\n\n");
  const tags = post.hashtags.map((t) => `{hashtag|\\#|${t}}`).join(" ");
  const commentary = escapeLittle(text) + (tags ? `\n\n${tags}` : "");

  const images = post.media.filter((m) => m.type === "image").slice(0, 9);
  const ids = [];
  for (const img of images) ids.push(await uploadImage(token, author, img));
  const content =
    ids.length === 1 ? { media: { id: ids[0] } } : ids.length > 1 ? { multiImage: { images: ids.map((id) => ({ id })) } } : undefined;

  const res = await fetch(`${API}/rest/posts`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      author,
      commentary,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
      ...(content ? { content } : {}),
    }),
  });
  await readJson(res, "LinkedIn");
  const urn = res.headers.get("x-restli-id");
  return { url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null };
}
