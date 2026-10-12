import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// "New document" links point here: create a blank doc, then open it.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const folder = url.searchParams.get("folder");
  const { data, error } = await supabase
    .from("documents")
    .insert({ folder_id: folder || null })
    .select("id")
    .single();
  if (error || !data) return NextResponse.redirect(new URL("/docs?error=create", url));
  return NextResponse.redirect(new URL(`/docs/${data.id}`, url));
}
