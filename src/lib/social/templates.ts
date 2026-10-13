import type { PlatformId, PostFormat } from "./platforms";

export type TemplateCategory = "hooks" | "lists" | "stories" | "how-to" | "threads" | "carousels" | "mine";

export type PostTemplate = {
  key: string;
  name: string;
  category: TemplateCategory;
  description: string;
  /** Instructions the AI follows to build the post. */
  structure: string;
  example: string;
  format: PostFormat;
  bestFor: PlatformId[];
};

export const CATEGORIES: { id: TemplateCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "hooks", label: "Hooks" },
  { id: "lists", label: "Lists" },
  { id: "stories", label: "Stories" },
  { id: "how-to", label: "How-to" },
  { id: "threads", label: "Threads" },
  { id: "carousels", label: "Carousels" },
  { id: "mine", label: "My templates" },
];

const ALL: PlatformId[] = ["linkedin", "x", "threads", "facebook", "instagram"];

export const TEMPLATES: PostTemplate[] = [
  {
    key: "contrarian",
    name: "Contrarian take",
    category: "hooks",
    description: "Challenge a common belief, then back it up.",
    structure: "Line 1: a bold statement that goes against common advice. Then explain why most people believe the opposite. Then 2-3 reasons or proof points for your view. End with the nuanced takeaway and a question.",
    example: "Unpopular opinion: you don't need a morning routine.\n\nYou need a shutdown routine.",
    format: "single",
    bestFor: ["linkedin", "x", "threads"],
  },
  {
    key: "curiosity-hook",
    name: "Curiosity gap",
    category: "hooks",
    description: "Open a loop the reader has to close.",
    structure: "Line 1: tease a surprising result or moment without revealing it. Line 2: raise the stakes. Then tell what happened in short beats. Reveal the insight near the end. Close with a one-line lesson.",
    example: "I almost lost my biggest client last week.\n\nThe reason? One sentence in an email.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "listicle",
    name: "Numbered list",
    category: "lists",
    description: "X things I learned about Y. Easy to skim, easy to save.",
    structure: "Hook line that states the number and the payoff. Then a numbered list of 5-7 items, each one line with a short why. End with a question asking readers to add their own.",
    example: "7 things 10 years of running a business taught me:\n\n1. Cash flow beats profit.\n2. Hire slow, fire fast.",
    format: "single",
    bestFor: ["linkedin", "facebook", "threads"],
  },
  {
    key: "mistakes",
    name: "Mistakes to avoid",
    category: "lists",
    description: "Common mistakes and what to do instead.",
    structure: "Hook naming the audience and the costly mistakes. Then 4-6 mistakes, each as '❌ mistake → ✅ what to do instead'. End with the one mistake that matters most.",
    example: "5 pricing mistakes that keep small businesses broke:\n\n❌ Pricing by the hour → ✅ Price by the outcome",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "myth-fact",
    name: "Myth vs. fact",
    category: "lists",
    description: "Bust the myths in your field.",
    structure: "Hook promising to clear up confusion. Then 3-5 pairs: 'Myth: ...' / 'Fact: ...'. End with the bigger truth behind all of them.",
    example: "Myth: You need a big audience to sell online.\nFact: You need the right 100 people.",
    format: "single",
    bestFor: ["linkedin", "instagram", "facebook"],
  },
  {
    key: "story-lesson",
    name: "Story with a lesson",
    category: "stories",
    description: "A personal moment that teaches something.",
    structure: "Open in the middle of the moment (time, place, tension). Tell it in short, vivid beats. Show the turning point. State the lesson in one sentence. Connect it to the reader with a question.",
    example: "2015. My first store. $40 in the register at closing.\n\nI sat in the parking lot and almost quit.",
    format: "single",
    bestFor: ["linkedin", "facebook", "instagram"],
  },
  {
    key: "before-after",
    name: "Before / after",
    category: "stories",
    description: "Show the transformation and what changed it.",
    structure: "Line 1: the 'before' state in one painful detail. Line 2: the 'after' state in one specific detail. Then the 2-3 changes that made the difference. End with encouragement for someone still in 'before'.",
    example: "A year ago: 60-hour weeks, no savings.\nToday: 35 hours, 6 months of runway.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "behind-scenes",
    name: "Behind the scenes",
    category: "stories",
    description: "Pull back the curtain on how you work.",
    structure: "Hook inviting the reader in ('Here's what nobody sees about...'). Describe the real process honestly, including the messy parts. Share one surprising detail. End by asking what they'd like to see next.",
    example: "Here's what a 'simple' product launch looked like behind the scenes:",
    format: "single",
    bestFor: ["instagram", "linkedin", "threads"],
  },
  {
    key: "case-study",
    name: "Result / case study",
    category: "stories",
    description: "A concrete result and how it happened.",
    structure: "Hook with the specific result (number + timeframe). Context: where things started. The 3 steps taken. The result again with one human detail. Takeaway for the reader.",
    example: "We cut our customer response time from 2 days to 2 hours.\n\nNo new hires.",
    format: "single",
    bestFor: ["linkedin", "facebook"],
  },
  {
    key: "how-to",
    name: "How-to in steps",
    category: "how-to",
    description: "Teach one thing in clear steps.",
    structure: "Hook naming the outcome and the time it takes. Then 3-6 numbered steps, each starting with a verb. Add one pro tip. End with a call to save or share.",
    example: "How to write a cold email that gets replies (in 5 minutes):\n\n1. Lead with their problem, not your product.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "quick-tip",
    name: "Quick tip",
    category: "how-to",
    description: "One useful tip. Short and sweet.",
    structure: "One-line hook naming the problem. The tip in one or two sentences. A quick example. Keep it under 300 characters total.",
    example: "Stop ending emails with 'Let me know.'\n\nEnd with a yes/no question instead. Replies double.",
    format: "single",
    bestFor: ["x", "threads", "linkedin"],
  },
  {
    key: "framework",
    name: "Framework / cheat sheet",
    category: "how-to",
    description: "Package your know-how into a named method.",
    structure: "Hook introducing a simple named framework (an acronym or 3-step name). Explain each part in one line with an example. End with when to use it.",
    example: "The 3C rule for every post: Clear, Concrete, Conversational.",
    format: "single",
    bestFor: ["linkedin", "instagram"],
  },
  {
    key: "question",
    name: "Ask your audience",
    category: "hooks",
    description: "Spark conversation with a good question.",
    structure: "Share a short observation or dilemma (2-3 lines). Give your own quick answer. Ask a specific, easy-to-answer question. Optionally offer 2-3 choices.",
    example: "Be honest: do you answer emails first thing in the morning?\n\nI used to. Now I wait until 11.",
    format: "single",
    bestFor: ["linkedin", "facebook", "threads"],
  },
  {
    key: "announcement",
    name: "Announcement",
    category: "hooks",
    description: "Share news without sounding like an ad.",
    structure: "Lead with why this matters to the reader, not the news itself. Then the news in one sentence. 2-3 specific benefits. A clear, friendly call to action.",
    example: "If you've ever lost a weekend to bookkeeping, this one's for you.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "thread-deep-dive",
    name: "Deep-dive thread",
    category: "threads",
    description: "Break a big idea into a 5-8 post thread.",
    structure: "Post 1: a strong hook that promises a specific payoff and says it's a thread. Posts 2 to N-1: one idea per post, concrete examples, numbered. Last post: summary plus a call to follow or share. 5-8 posts.",
    example: "1/ I've hired 40 people in 10 years. Here's the interview question that never fails me:",
    format: "thread",
    bestFor: ["x", "threads"],
  },
  {
    key: "carousel-steps",
    name: "Step-by-step carousel",
    category: "carousels",
    description: "Slides that teach a process, one step per slide.",
    structure: "Slide 1: bold title promising an outcome. Slides 2 to N-1: one step each, a short headline plus one or two lines. Last slide: recap and call to save/follow. 6-9 slides.",
    example: "Slide 1: 5 steps to a website that actually sells",
    format: "carousel",
    bestFor: ["instagram", "linkedin"],
  },
  {
    key: "carousel-myths",
    name: "Myths carousel",
    category: "carousels",
    description: "One myth per slide, then the truth.",
    structure: "Slide 1: '[N] myths about [topic] that cost you money'. One myth per slide with the fact underneath. Last slide: the takeaway and a call to share. 5-8 slides.",
    example: "Slide 2: Myth: More followers = more sales. Truth: Trust = sales.",
    format: "carousel",
    bestFor: ["instagram", "linkedin"],
  },
];

export const FREE_WRITE: PostTemplate = {
  key: "free",
  name: "Free write",
  category: "hooks",
  description: "No template. Just your idea, made platform-ready.",
  structure: "Write the best possible post for this idea, choosing whatever structure fits it.",
  example: "",
  format: "single",
  bestFor: ALL,
};

export function findTemplate(key: string | null | undefined): PostTemplate | undefined {
  if (key === "free") return FREE_WRITE;
  return TEMPLATES.find((t) => t.key === key);
}
