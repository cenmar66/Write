import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { requireOwner } from "@/lib/ai/server";
import { saveAccount } from "@/lib/publish/accounts";
import { getAccount } from "@/lib/publish/accounts";
import { instagramExchange } from "@/lib/publish/instagram";
import { linkedinAuthors, linkedinExchange } from "@/lib/publish/linkedin";
import { metaExchange, metaPages } from "@/lib/publish/meta";
import { checkState, OAUTH_PLATFORMS, type OAuthPlatform, redirectUri } from "@/lib/publish/oauth";
import { threadsExchange } from "@/lib/publish/threads";

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const url = new URL(request.url);
  const origin = url.origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/settings?${q}#accounts`);

  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { platform } = await params;
  if (!(platform in OAUTH_PLATFORMS)) return back("connect_error=unknown");
  const p = platform as OAuthPlatform;

  if (url.searchParams.get("error")) return back(`connect_error=${encodeURIComponent(url.searchParams.get("error_description") ?? "You cancelled the connection.")}`);
  if (!(await checkState(p, url.searchParams.get("state")))) return back("connect_error=" + encodeURIComponent("The connection timed out. Please try again."));
  const code = url.searchParams.get("code");
  if (!code) return back("connect_error=" + encodeURIComponent("No authorization code was returned."));

  const { supabase } = auth;
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub as string;
  const ru = redirectUri(origin, p);

  try {
    if (p === "linkedin") {
      const t = await linkedinExchange(code, ru);
      const { me, authors } = await linkedinAuthors(t.access_token);
      // Default to a company page when one is available.
      const author = authors.find((a) => a.type === "organization") ?? authors[0];
      await saveAccount(supabase, "linkedin", {
        userId,
        accountId: me.sub,
        accountName: author.name,
        avatarUrl: me.picture,
        token: t.access_token,
        refreshToken: t.refresh_token,
        expiresInSeconds: t.expires_in,
        meta: { author_urn: author.urn, authors },
      });
      return back("connected=linkedin");
    }

    if (p === "meta") {
      const userToken = await metaExchange(code, ru);
      const pages = await metaPages(userToken);
      if (!pages.length) return back("connect_error=" + encodeURIComponent("No Facebook Pages found. Create a Page and link your Instagram to it, then try again."));
      const page = pages.find((pg) => pg.instagram_business_account) ?? pages[0];
      const pageList = pages.map((pg) => ({
        id: pg.id,
        name: pg.name,
        picture: pg.picture?.data?.url ?? null,
        token_enc: encrypt(pg.access_token),
        instagram: pg.instagram_business_account ?? null,
      }));
      await saveAccount(supabase, "facebook", {
        userId,
        accountId: page.id,
        accountName: page.name,
        avatarUrl: page.picture?.data?.url,
        token: page.access_token,
        meta: { pages: pageList },
      });
      // Keep an Instagram account you connected directly; don't replace it with the Page's.
      const existingIg = await getAccount(supabase, "instagram", userId).catch(() => null);
      if (existingIg?.meta.login === "instagram") return back("connected=facebook");
      if (page.instagram_business_account) {
        const ig = page.instagram_business_account;
        await saveAccount(supabase, "instagram", {
          userId,
          accountId: ig.id,
          accountName: ig.username ? `@${ig.username}` : "Instagram",
          avatarUrl: ig.profile_picture_url,
          token: page.access_token,
          meta: { page_id: page.id },
        });
        return back("connected=meta");
      }
      return back("connected=facebook&connect_error=" + encodeURIComponent(`Facebook connected, but the Page "${page.name}" has no Instagram Business account linked.`));
    }

    if (p === "instagram") {
      const t = await instagramExchange(code, ru);
      await saveAccount(supabase, "instagram", {
        userId,
        accountId: t.id,
        accountName: `@${t.me.username}`,
        avatarUrl: t.me.profile_picture_url,
        token: t.token,
        expiresInSeconds: t.expiresIn,
        meta: { login: "instagram", account_type: t.me.account_type ?? null },
      });
      return back("connected=instagram");
    }

    if (p === "threads") {
      const t = await threadsExchange(code, ru);
      await saveAccount(supabase, "threads", {
        userId,
        accountId: String(t.me.id),
        accountName: `@${t.me.username}`,
        avatarUrl: t.me.threads_profile_picture_url,
        token: t.token,
        expiresInSeconds: t.expiresIn,
      });
      return back("connected=threads");
    }
  } catch (error) {
    console.error(`Connecting ${p} failed`, error);
    return back("connect_error=" + encodeURIComponent((error as Error).message || "Connection failed."));
  }
  return back("connect_error=unknown");
}
