// Rules that keep every AI-written word from sounding machine-made.
// Added to the instructions for drafts, edits, chat, posts, and newsletters.

export const ANTI_SLOP = `Write like a thoughtful person, not like an AI. Avoid these tells:
- No em dashes (—). Use a period, comma, colon, or parentheses instead.
- No "it's not X, it's Y" or "this isn't about X, it's about Y" contrasts.
- No fake-suspense questions answered right away ("The result? ...", "The catch? ...").
- No stock openers or closers: "Here's the thing", "Let's dive in", "In today's fast-paced world", "Let that sink in", "Picture this", "In conclusion", "At the end of the day".
- No AI vocabulary: delve, tapestry, testament, realm, landscape, navigate, unlock, unleash, elevate, harness, seamless, robust, pivotal, foster, myriad, plethora, game-changer.
- Don't list things in threes by habit. Use as many items as the point needs.
- No emoji as bullet points, and no emoji unless the author uses them.
- Vary sentence length. Mix short sentences with longer ones.
- Prefer concrete details, numbers, and plain words over abstractions and hype.`;

export const HUMANIZE = `Rewrite the passage so it sounds like a real person wrote it. Find what sounds machine-made (the patterns listed above, generic filler, hype, a monotone rhythm) and fix only that. Leave sentences that already sound human exactly as they are. Keep the meaning, facts, formatting, and roughly the same length.`;
