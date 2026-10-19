import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoiceProfile } from "./ai/voice";

export type WritingStyle = {
  id: string;
  name: string;
  description: string;
  profile: VoiceProfile | null;
  profile_updated_at: string | null;
  is_default: boolean;
  created_at: string;
};

export const STYLE_FIELDS = "id,name,description,profile,profile_updated_at,is_default,created_at";

/** Your styles, default first. Returns [] if the styles table isn't set up yet. */
export async function listStyles(supabase: SupabaseClient): Promise<WritingStyle[]> {
  const { data, error } = await supabase
    .from("writing_styles")
    .select(STYLE_FIELDS)
    .order("is_default", { ascending: false })
    .order("created_at");
  return error ? [] : ((data as WritingStyle[]) ?? []);
}
