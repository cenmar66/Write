import { requireOwner } from "@/lib/ai/server";

// Hands the browser a 30-second Deepgram token so the real API key never leaves the server.
export async function POST() {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return Response.json({ error: "Dictation isn't set up yet. Add DEEPGRAM_API_KEY in Vercel." }, { status: 503 });
  }

  const res = await fetch("https://api.deepgram.com/v1/auth/grant", {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl_seconds: 30 }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("Deepgram token request failed", res.status, await res.text());
    const error = res.status === 401 || res.status === 403 ? "The Deepgram API key is wrong or lacks permission." : "Couldn't reach Deepgram.";
    return Response.json({ error }, { status: 502 });
  }
  const { access_token } = (await res.json()) as { access_token: string };
  return Response.json({ token: access_token }, { headers: { "Cache-Control": "no-store" } });
}
