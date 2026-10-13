import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/ai/server";
import { missingEnv, newState, OAUTH_PLATFORMS, type OAuthPlatform, redirectUri } from "@/lib/publish/oauth";

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { platform } = await params;
  const origin = new URL(request.url).origin;
  if (!(platform in OAUTH_PLATFORMS)) return NextResponse.redirect(`${origin}/settings?connect_error=unknown`);
  const p = platform as OAuthPlatform;
  const missing = missingEnv(p);
  if (missing) return NextResponse.redirect(`${origin}/settings?connect_error=${encodeURIComponent(`Add ${missing} in Vercel first.`)}#accounts`);
  return NextResponse.redirect(OAUTH_PLATFORMS[p].authUrl(redirectUri(origin, p), await newState(p)));
}
