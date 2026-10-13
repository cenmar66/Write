"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaItem } from "@/lib/publish/types";

const MAX_SIDE = 1440;
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

/** Re-encodes any image as JPEG (Instagram only accepts JPEG) and shrinks huge photos. */
export async function toJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert image."))), "image/jpeg", 0.9));
}

/** Uploads to your folder in the public "media" bucket and returns its public link. */
export async function uploadMedia(supabase: SupabaseClient, file: Blob, kind?: "image" | "video"): Promise<MediaItem> {
  const type = kind ?? (file.type.startsWith("video/") ? "video" : "image");
  if (type === "video" && file.size > MAX_VIDEO_BYTES) throw new Error("That video is over 250 MB.");
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error("You're signed out. Refresh and sign in again.");

  const body = type === "image" ? await toJpeg(file) : file;
  const ext = type === "image" ? "jpg" : file.type.includes("quicktime") ? "mov" : "mp4";
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("media")
    .upload(path, body, { contentType: type === "image" ? "image/jpeg" : file.type || "video/mp4", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { url: supabase.storage.from("media").getPublicUrl(path).data.publicUrl, type, path };
}
