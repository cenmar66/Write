import type { PlatformId, PostFormat } from "./platforms";

export type TemplateCategory = "essays" | "hooks" | "ideas" | "lists" | "stories" | "how-to" | "threads" | "carousels" | "mine";

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
  { id: "essays", label: "Essays" },
  { id: "hooks", label: "Hooks" },
  { id: "ideas", label: "Ideas" },
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


const LONG: PlatformId[] = ["linkedin", "facebook"];
const SHORT: PlatformId[] = ["linkedin", "x", "threads"];

// Typeshare / Ship 30-style formats: essays, idea frameworks, and more lists, stories, and threads.
const MORE: PostTemplate[] = [
  {
    key: "atomic-essay",
    name: "Atomic Essay",
    category: "essays",
    description: "A complete 250-word essay: one idea, fully explained.",
    structure:
      "About 250 words (200-300). Line 1: a headline that names the reader and the outcome. Intro (2-3 short lines): who this is for, the problem they feel, and the promise. Body: 3 short sections, each starting with a bold or numbered mini-headline, 1-3 sentences each, concrete and specific. Conclusion: one or two punchy lines that restate the big idea. Short paragraphs, no fluff, no hashtags in the body.",
    example: "How To Hire Your First Employee Without Regret\n\nMost founders hire too fast. They feel the pain of doing everything, so they grab the first good-enough person.\n\n1. Write the role before the job post…",
    format: "single",
    bestFor: LONG,
  },
  {
    key: "subatomic-essay",
    name: "Subatomic Essay",
    category: "essays",
    description: "A tiny essay that fits on one image card (about 50 words).",
    structure:
      "40-70 words total. Line 1: a short, bold headline (under 8 words). Then 3-5 very short lines that build one idea, each line a complete thought. Last line: the punchline or takeaway. Written to be turned into a quote card image, so no hashtags or links inside it.",
    example: "Busy Isn't A Strategy\n\nBusy feels productive.\nBusy looks impressive.\nBusy fills the calendar.\n\nBut focus is what moves the needle.",
    format: "single",
    bestFor: ["instagram", "linkedin", "x", "threads"],
  },
  {
    key: "annotated-quote",
    name: "Annotated quote",
    category: "ideas",
    description: "Share a quote you love, then what it means to you.",
    structure:
      "Line 1: the quote in quotation marks with the author's name. Then one line on why it stuck with you. Then 2-3 short lines applying it to your reader's work or life, with one concrete example. End with a one-line takeaway.",
    example: "\"The obstacle is the way.\" — Marcus Aurelius\n\nI used to read this as motivation. Now I read it as instructions.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "observation",
    name: "Observation",
    category: "ideas",
    description: "Something you noticed that others miss.",
    structure:
      "Line 1: 'I've noticed something about [group/topic]:' or a direct statement of the pattern. Then 2-3 examples that show the pattern. Then why it happens. End with what the reader should do about it.",
    example: "I've noticed something about the best salespeople I know:\n\nThey talk the least in the room.",
    format: "single",
    bestFor: SHORT,
  },
  {
    key: "reframe",
    name: "Reframe",
    category: "ideas",
    description: "Take a familiar idea and flip how people see it.",
    structure:
      "Line 1: 'Most people see [X] as [common view].' Line 2: 'I see it as [new view].' Then explain the shift in 2-4 short lines with an example. End with a one-line takeaway the reader can use today.",
    example: "Most people see rejection as a no.\n\nI see it as a 'not yet, and here's why.'",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "prediction",
    name: "Bold prediction",
    category: "ideas",
    description: "Where your industry is heading, and why.",
    structure:
      "Line 1: a specific, bold prediction with a timeframe. Then 3 signals you're seeing today that point to it. Then what it means for the reader. End with a question inviting agreement or disagreement.",
    example: "Prediction: in 3 years, every small business will have an AI front desk.\n\nHere's what I'm seeing:",
    format: "single",
    bestFor: SHORT,
  },
  {
    key: "mental-model",
    name: "Mental model",
    category: "ideas",
    description: "Name a way of thinking and show how to use it.",
    structure:
      "Line 1: name the mental model and the problem it solves. Then explain it in one plain sentence. Then a quick real-world example. Then 2-3 situations where the reader can apply it. End with a one-line summary.",
    example: "The 'two-way door' rule changed how I make decisions.\n\nIf a choice is easy to undo, decide fast.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "comparison",
    name: "This vs. that",
    category: "lists",
    description: "Compare two approaches side by side.",
    structure:
      "Line 1: '[Thing A] vs. [Thing B]:' as the hook. Then 4-6 paired lines contrasting them ('A: … / B: …' or 'Amateurs … / Pros …'). End with one line on which to choose and why.",
    example: "Busy founders vs. effective founders:\n\nBusy: answer every email.\nEffective: answer the right ones.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "do-dont",
    name: "Do this, not that",
    category: "lists",
    description: "Swap a common habit for a better one.",
    structure:
      "Hook line naming the topic. Then 4-6 lines in the form '❌ Don't: … / ✅ Do: …' (or 'Instead of … try …'). End with the principle behind all of them in one line.",
    example: "Better meetings in 5 swaps:\n\nInstead of 'any updates?' → ask 'what's blocked?'",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "curated-list",
    name: "Curated resources",
    category: "lists",
    description: "The best books, tools, or links on a topic.",
    structure:
      "Hook line: '[N] [resources] that [specific outcome]:'. Then a numbered list, each item with its name and one line on why it's worth it. End with a question asking readers for their favorite.",
    example: "5 books that made me a better leader:\n\n1. Extreme Ownership — no excuses, ever.",
    format: "single",
    bestFor: ["linkedin", "facebook", "threads"],
  },
  {
    key: "questions",
    name: "Questions to ask yourself",
    category: "lists",
    description: "A short list of questions that make readers think.",
    structure:
      "Hook line: '[N] questions to ask before you [decision/situation]:'. Then a numbered list of 5-7 sharp questions, each with an optional one-line why. End with the one question that matters most.",
    example: "6 questions to ask before you take on a new client:\n\n1. Do they respect my time already?",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "signs",
    name: "Signs you're…",
    category: "lists",
    description: "Signs you're doing something right (or wrong).",
    structure:
      "Hook line: '[N] signs you're [situation]:'. Then a numbered list of 5-7 specific, recognizable signs. End with an encouraging or challenging one-line close.",
    example: "7 signs you're ready to raise your prices:\n\n1. You're booked out for weeks.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "three-lessons",
    name: "3 lessons from…",
    category: "stories",
    description: "One experience, three lessons.",
    structure:
      "Line 1: name the experience in one specific sentence. One or two lines of context. Then '3 lessons:' and three numbered lessons, each with one sentence of why. End with the lesson you'd tell your younger self.",
    example: "I lost a $50K deal yesterday.\n\n3 lessons I'm taking with me:",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "start-over",
    name: "If I had to start over",
    category: "stories",
    description: "What you'd do differently, knowing what you know now.",
    structure:
      "Line 1: 'If I had to start [business/career/skill] from zero, here's exactly what I'd do:'. Then a numbered list of 5-7 concrete steps, each one line. End with the one thing you'd never skip.",
    example: "If I had to start my business over from zero, here's exactly what I'd do:\n\n1. Sell before I build.",
    format: "single",
    bestFor: ["linkedin", "x", "threads", "facebook"],
  },
  {
    key: "milestone",
    name: "Milestone reflection",
    category: "stories",
    description: "Celebrate a milestone with what it taught you.",
    structure:
      "Line 1: the milestone, stated plainly with a number or date. Then a short honest line about the journey (the hard part). Then 3 things that made the difference. End with a thank-you or a line of encouragement for the reader.",
    example: "10 years ago today I started Mastery Enterprises with one client and a laptop.",
    format: "single",
    bestFor: ["linkedin", "facebook", "instagram"],
  },
  {
    key: "pas",
    name: "Problem → solution",
    category: "how-to",
    description: "Name the pain, stir it, then solve it.",
    structure:
      "Line 1: name a specific problem the reader has. Then 2 lines on why it hurts (the cost of ignoring it). Then the solution in 3 clear steps. End with a one-line nudge to take the first step.",
    example: "Your website gets visitors but no calls.\n\nEvery day it stays that way costs you leads.",
    format: "single",
    bestFor: ALL,
  },
  {
    key: "thread-listicle",
    name: "List thread",
    category: "threads",
    description: "One tip per post, numbered, with a strong opener.",
    structure:
      "Post 1: hook with the number and payoff, ending with 'A thread 🧵'. Posts 2 to N-1: one tip each, a bold first line and one or two lines of why. Last post: recap in one line and a call to repost or follow. 6-10 posts.",
    example: "1/ 9 lessons from 10 years of running a service business. A thread 🧵",
    format: "thread",
    bestFor: ["x", "threads"],
  },
  {
    key: "thread-story",
    name: "Story thread",
    category: "threads",
    description: "Tell a story across posts, end with the lesson.",
    structure:
      "Post 1: a gripping opening moment that makes people want the rest. Posts 2 to N-2: the story in short beats, one moment per post, building tension. Second-to-last post: the turning point. Last post: the lesson and a question for readers. 5-8 posts.",
    example: "1/ In 2019 I had $312 in the bank and payroll due Friday. Here's what happened next:",
    format: "thread",
    bestFor: ["x", "threads"],
  },
];

TEMPLATES.push(...MORE);

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
