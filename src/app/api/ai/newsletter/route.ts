import { PROVIDERS } from "@/lib/ai/providers";
import { loadAiSettings, requireOwner } from "@/lib/ai/server";

export const maxDuration = 120;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A compelling newsletter title, under 70 characters." },
    subtitle: { type: "string", description: "One sentence that makes people open the email, under 140 characters." },
    description: { type: "string", description: "Preview / search description, about 150 characters." },
    note: { type: "string", description: "A Substack Note (short post) teasing this issue, under 300 characters." },
  },
  required: ["title", "subtitle", "description", "note"],
  additionalProperties: false,
} as const;

/** Suggests a Substack-ready title, subtitle, preview text, and a teaser Note for a document. */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if ("denied" in auth) return auth.denied;
  const { documentId } = (await request.json()) as { documentId?: string };
  const { data: doc } = await auth.supabase.from("documents").select("title,content_text").eq("id", documentId ?? "").maybeSingle();
  if (!doc?.content_text?.trim()) return Response.json({ error: "The document is empty." }, { status: 400 });

  const { model, voice } = await loadAiSettings(auth.supabase, { documentId });
  const provider = PROVIDERS[model.provider];
  try {
    const result = await provider.generateJson(
      {
        model,
        system: [
          "You package writing as a Substack newsletter issue. Write in the same language as the document (English or Spanish). Be specific and inviting, never clickbait.",
          voice,
        ]
          .filter(Boolean)
          .join("\n\n"),
        messages: [{ role: "user", content: `<document title="${doc.title.replace(/"/g, "'")}">\n${doc.content_text}\n</document>` }],
        effort: "low",
        maxTokens: 4000,
      },
      SCHEMA,
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: provider.describeError(error) }, { status: 502 });
  }
}
