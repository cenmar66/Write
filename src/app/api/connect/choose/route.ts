import { decrypt } from "@/lib/crypto";
import { requireOwner } from "@/lib/ai/server";
import { getAccount, saveAccount } from "@/lib/publish/accounts";
import type { LinkedInAuthor } from "@/lib/publish/linkedin";

type PageEntry = { id: string; name: string; picture: string | null; token_enc: string; instagram: { id: string; username?: string; profile_picture_url?: string } | null };

/** Pick which LinkedIn profile/page or which Facebook Page (and its Instagram) to post as. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { supabase } = auth;
  const { platform, value } = (await request.json()) as { platform?: string; value?: string };

  if (platform === "linkedin") {
    const acc = await getAccount(supabase, "linkedin");
    const author = (acc?.meta.authors as LinkedInAuthor[] | undefined)?.find((a) => a.urn === value);
    if (!acc || !author) return Response.json({ error: "Not found." }, { status: 404 });
    await supabase
      .from("connected_accounts")
      .update({ account_name: author.name, meta: { ...acc.meta, author_urn: author.urn } })
      .eq("platform", "linkedin");
    return Response.json({ ok: true });
  }

  if (platform === "facebook") {
    const acc = await getAccount(supabase, "facebook");
    const pages = (acc?.meta.pages as PageEntry[] | undefined) ?? [];
    const page = pages.find((p) => p.id === value);
    if (!acc || !page) return Response.json({ error: "Not found." }, { status: 404 });
    const token = decrypt(page.token_enc);
    const directIg = (await getAccount(supabase, "instagram").catch(() => null))?.meta.login === "instagram";
    await saveAccount(supabase, "facebook", { userId: acc.userId, accountId: page.id, accountName: page.name, avatarUrl: page.picture, token, meta: acc.meta });
    if (directIg) {
      // An Instagram connected directly stays as it is.
    } else if (page.instagram) {
      await saveAccount(supabase, "instagram", {
        userId: acc.userId,
        accountId: page.instagram.id,
        accountName: page.instagram.username ? `@${page.instagram.username}` : "Instagram",
        avatarUrl: page.instagram.profile_picture_url,
        token,
        meta: { page_id: page.id },
      });
    } else {
      await supabase.from("connected_accounts").delete().eq("platform", "instagram");
    }
    return Response.json({ ok: true, instagram: !!page.instagram });
  }
  return Response.json({ error: "Unknown platform." }, { status: 400 });
}
