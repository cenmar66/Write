import { NextResponse } from "next/server";
import { authUrl, getAccount, newState, SCOPES } from "@/lib/canvas/google";
import { guard } from "../_auth";

/** Starts Google sign-in. ?scope=calendar (default) or tasks. Scopes are added incrementally. */
export async function GET(request: Request) {
  const g = await guard();
  if ("denied" in g) return g.denied;
  const url = new URL(request.url);
  const want = url.searchParams.get("scope") === "tasks" ? SCOPES.tasks : SCOPES.calendar;
  const acc = await getAccount(g.supabase);
  return NextResponse.redirect(authUrl(url.origin, want, await newState(), acc?.google_email));
}
