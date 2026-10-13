import { requireOwner } from "@/lib/ai/server";
import { saveAccount } from "@/lib/publish/accounts";
import { substackProfile } from "@/lib/publish/substack";

// Saves your Substack session cookie (encrypted) after checking it works.
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { cookie, subdomain } = (await request.json()) as { cookie?: string; subdomain?: string };
  const value = cookie?.trim().replace(/^substack\.sid=/, "");
  if (!value) return Response.json({ error: "Paste your substack.sid cookie." }, { status: 400 });

  try {
    const profile = await substackProfile(value);
    const sub = subdomain?.trim().replace(/\.substack\.com.*$/, "").replace(/^https?:\/\//, "") || profile.subdomain;
    if (!sub) return Response.json({ error: "Couldn't find your publication. Type its subdomain (the part before .substack.com)." }, { status: 400 });
    const { data } = await auth.supabase.auth.getClaims();
    await saveAccount(auth.supabase, "substack", {
      userId: data?.claims?.sub as string,
      accountId: String(profile.userId),
      accountName: profile.publication ? `${profile.publication} (${sub}.substack.com)` : `${sub}.substack.com`,
      avatarUrl: profile.photo,
      token: value,
      meta: { subdomain: sub },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message || "That cookie didn't work." }, { status: 400 });
  }
}
