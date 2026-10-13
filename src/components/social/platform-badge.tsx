import { PLATFORMS, type PlatformId } from "@/lib/social/platforms";

export function PlatformBadge({ platform, size = "md" }: { platform: PlatformId; size?: "sm" | "md" }) {
  const { badge, label } = PLATFORMS[platform];
  return (
    <span
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 place-items-center rounded-lg font-semibold ${badge.className} ${size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs"}`}
    >
      {badge.text}
    </span>
  );
}
