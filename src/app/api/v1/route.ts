import { authenticate } from "@/lib/access-tokens";

/** A quick "is my code working?" check that also lists what the API can do. */
export async function GET(request: Request) {
  const auth = await authenticate(request, "read");
  if ("denied" in auth) return auth.denied;
  return Response.json({
    ok: true,
    app: "Write.ai",
    access: auth.scope === "write" ? "read and write" : "read only",
    endpoints: {
      "GET /api/v1/documents?q=&limit=": "List or search your documents (newest first).",
      "GET /api/v1/documents/{id}": "Read one document as Markdown.",
      "POST /api/v1/documents": "Create a document. Body: { title?, markdown, folder_id?, style_id? } (write access).",
      "PATCH /api/v1/documents/{id}": "Update. Body: { title?, markdown? (replaces), append? (adds to the end) } (write access).",
      "DELETE /api/v1/documents/{id}": "Move a document to the Trash (write access).",
      "GET /api/v1/styles": "List your writing styles and their profiles.",
    },
  });
}
