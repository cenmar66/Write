import type { PlatformId } from "./platforms";
import { LIBRARY as BASE_LIBRARY } from "./prompt-library";
import { LIBRARY_MORE } from "./prompt-library-more";

const LIBRARY = [...BASE_LIBRARY, ...LIBRARY_MORE];

// A library of writing prompts (idea starters), in the spirit of Typeshare's,
// written for Write.ai. Each prompt picks a format, which sets the template and platforms.

export type PromptFormat = "atomic" | "short" | "linkedin" | "thread";

export const PROMPT_FORMATS: Record<PromptFormat, { label: string; template: string; platforms: PlatformId[] }> = {
  atomic: { label: "Atomic Essay", template: "atomic-essay", platforms: ["linkedin"] },
  short: { label: "Short Form", template: "free", platforms: ["x", "threads"] },
  linkedin: { label: "LinkedIn", template: "free", platforms: ["linkedin"] },
  thread: { label: "Thread", template: "thread-listicle", platforms: ["x"] },
};

export type TopicPrompt = { key: string; emoji: string; title: string; prompt: string; theme: string; format: PromptFormat };

/** A pack you made (stored in Supabase). */
export type UserPack = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  prompts: { emoji: string; title: string; prompt: string; format: PromptFormat }[];
  created_at: string;
};

type Row = [emoji: string, title: string, prompt: string, format: PromptFormat];

const THEMES: Record<string, Row[]> = {
  Traits: [
    ["🧭", "The Trait I'm Building Now", "Name one trait you're actively working on this year, why it matters to you, and the daily practice you use to build it.", "atomic"],
    ["⭐", "What the Best Have in Common", "Think of the people you admire most in your field. What 3 traits do they all share?", "short"],
    ["🔍", "What I Look For in People", "When you hire, partner, or pick a client, which traits do you look for first, and why do they matter so much to you?", "linkedin"],
    ["📉", "Traits That Held Me Back", "Which habit or trait slowed you down early on, and which one finally helped you break through?", "linkedin"],
    ["⚖️", "Two Kinds of People", "Describe the traits that separate the people who thrive in your industry from those who stall.", "linkedin"],
    ["🪞", "The Compliment That Changed Me", "Share a piece of feedback about your character that changed how you see yourself.", "short"],
  ],
  Milestones: [
    ["🔄", "A Year of Change", "Look back over the last 12 months. What changed in you, your work, or your business, and what drove it?", "atomic"],
    ["🎂", "Lessons on My Birthday", "Mark your birthday with the most important lessons you learned this past year.", "short"],
    ["📜", "Truths for My Younger Self", "What hard truths would you give your 25-year-old self? List them plainly.", "linkedin"],
    ["🏁", "The Anniversary Post", "Celebrate a business or career anniversary: where you started, the hardest moment, and what kept you going.", "linkedin"],
    ["📸", "Behind the Milestone", "Show the unglamorous side of a recent win: the work nobody saw.", "short"],
    ["🧾", "My Rules for Life", "Share the personal rules you've used to get where you are, one line each.", "thread"],
  ],
  Tools: [
    ["🧰", "The Essential Toolkit", "List the tools every person in your niche needs to get started, and one line on why for each.", "short"],
    ["🚀", "Tools That Move the Needle", "Which tools actually drive results in your business, and how does each one contribute?", "linkedin"],
    ["🪜", "The Next-Level Stack", "Explain the tools that helped you go from one stage to the next, and save readers the mistakes you made picking them.", "atomic"],
    ["🔧", "The Underrated Tool", "Name the tool most people ignore that you couldn't work without, and why.", "linkedin"],
    ["🏆", "Tools, Ranked (Honestly)", "Share a tongue-in-cheek ranking of tools for an outcome, where the real winner is a simple habit.", "short"],
    ["🗑️", "Tools I Stopped Using", "Which popular tools did you drop, and what did you replace them with?", "linkedin"],
  ],
  Reasons: [
    ["💡", "The Real Reason I Do It", "Share the real reason you keep a daily habit, beyond the reasons most people give.", "atomic"],
    ["🌱", "The Reason Nobody Mentions", "Share an underrated reason to do something, the moment you realized it, and the lesson.", "short"],
    ["🤔", "Good Reasons vs. Bad Reasons", "Contrast the good and bad reasons people start something in your industry, and what most get wrong.", "linkedin"],
    ["❓", "Questions Before You Start", "Help readers decide if they should do something by giving them a short list of questions to ask themselves.", "atomic"],
    ["🎲", "Why I Took the Leap", "Tell the story of a big or unexpected move you made, and why, to inspire readers to take theirs.", "linkedin"],
    ["🛑", "Why I Said No", "Explain an opportunity you turned down and the reasoning behind it.", "short"],
  ],
  Mistakes: [
    ["🚧", "My Most Expensive Mistake", "Describe the mistake that cost you the most (money, time, or trust) and what it taught you.", "atomic"],
    ["⚠️", "Beginner Mistakes in My Field", "List the mistakes almost everyone makes when starting out in your industry.", "thread"],
    ["🔁", "The Mistake I Keep Making", "Be honest about a mistake you repeat, why it happens, and what you're doing about it.", "linkedin"],
    ["🧯", "How I Recovered", "Share a time things went wrong and the exact steps you took to recover.", "linkedin"],
    ["🙅", "Advice I Regret Following", "What popular advice did you follow that backfired, and what do you do instead?", "short"],
    ["📋", "The Pre-Mortem", "Before your next big project, list the ways it could fail and how you'll prevent each one.", "linkedin"],
  ],
  Habits: [
    ["⏰", "My Non-Negotiables", "Share the 3-5 daily habits you protect no matter what, and why each one matters.", "linkedin"],
    ["🌅", "How I Start the Day", "Walk readers through the first hour of your day and what each step does for you.", "short"],
    ["🌙", "My Shutdown Routine", "Explain how you end your workday so you can actually rest.", "short"],
    ["🧱", "Small Habit, Big Results", "Describe one tiny habit that compounded into a big result over time.", "atomic"],
    ["🚫", "Habits I Quit", "Which habits did you drop, and what changed after you did?", "linkedin"],
    ["📆", "My Weekly Review", "Share the questions you ask yourself every week to stay on track.", "thread"],
  ],
  Advice: [
    ["🎯", "The Best Advice I Ever Got", "Share the best advice you've received, who gave it, and how it changed your path.", "linkedin"],
    ["🗣️", "Advice I'd Give a New Founder", "If a friend were starting a business tomorrow, what would you tell them?", "thread"],
    ["🔄", "Common Advice, Flipped", "Pick a piece of common advice in your industry and explain when it's wrong.", "atomic"],
    ["👂", "Advice I Ignored (and Why)", "Share advice you chose not to follow, and why it was right for you to ignore it.", "short"],
    ["🧓", "Wisdom From a Mentor", "Share a lesson a mentor taught you and how you apply it today.", "linkedin"],
    ["📌", "One-Line Lessons", "Share a list of one-line lessons from your career, no explanation needed.", "short"],
  ],
  Beliefs: [
    ["🔥", "My Unpopular Opinion", "Share a belief about your industry that most people disagree with, and your reasons.", "linkedin"],
    ["🧠", "What I Changed My Mind About", "Describe something you used to believe strongly and what made you change your mind.", "atomic"],
    ["🏛️", "Principles I Run On", "List the core principles you use to make decisions in your business.", "thread"],
    ["💬", "A Quote I Live By", "Share a quote that guides you and what it means in your daily work.", "short"],
    ["🌍", "What I Believe About Work", "Explain what you believe good work looks like, and how that shapes how you lead.", "linkedin"],
    ["⚡", "The Myth I Want to Kill", "Name a myth in your field and replace it with the truth.", "short"],
  ],
  Stories: [
    ["📖", "How It All Started", "Tell the origin story of your business or career in a few short beats.", "atomic"],
    ["🌧️", "My Lowest Point", "Share a low point honestly, what got you through, and what you'd tell someone in it now.", "linkedin"],
    ["🤝", "The Client Who Changed Everything", "Tell the story of a client or customer who changed how you work.", "linkedin"],
    ["🎢", "A Week in My Life", "Give readers an honest look at a real week: wins, setbacks, and surprises.", "thread"],
    ["😂", "The Funniest Thing That Happened", "Share a funny moment from work and the small lesson inside it.", "short"],
    ["🧗", "The Hardest Thing I've Done", "Describe the hardest challenge you've faced and the turning point.", "atomic"],
  ],
  Frameworks: [
    ["🗺️", "My Step-by-Step Process", "Break down the exact process you use to get a result for clients.", "thread"],
    ["🧮", "The Simple Formula", "Share a simple formula or rule of thumb you use to make decisions faster.", "short"],
    ["📊", "The 2x2 That Explains It", "Explain a topic in your field by sorting it into four boxes on two axes.", "linkedin"],
    ["🪄", "My Checklist", "Share the checklist you run through before launching or delivering anything.", "linkedin"],
    ["🔑", "The Mental Model I Use Most", "Name a mental model, explain it simply, and show it in action.", "atomic"],
    ["🧩", "Problem → Solution", "Name a painful problem your audience has and walk through how you solve it.", "linkedin"],
  ],
  Predictions: [
    ["🔮", "Where My Industry Is Going", "Make a specific prediction about your industry over the next 3 years and share the signs.", "linkedin"],
    ["🤖", "AI and My Work", "How is AI changing your field, and what should people do about it now?", "atomic"],
    ["📈", "Trends Worth Watching", "List the trends you're watching this year and why each matters.", "thread"],
    ["🕰️", "What Won't Change", "In a fast-changing field, what will still matter in 10 years?", "short"],
    ["🎯", "The Bet I'm Making", "Share a bet you're making on the future of your business and why.", "linkedin"],
    ["🙃", "A Prediction I Got Wrong", "Share a prediction you got wrong and what it taught you about forecasting.", "short"],
  ],
  Resources: [
    ["📚", "Books That Shaped Me", "Share the books that changed how you think about work, with one line on each.", "linkedin"],
    ["🎧", "Podcasts on Repeat", "List the podcasts or talks you return to and what you've learned from them.", "short"],
    ["👥", "People Worth Following", "Recommend people in your field worth following and why.", "thread"],
    ["🧪", "My Favorite Free Resources", "Share free resources that would help a beginner in your field.", "linkedin"],
    ["✍️", "What I'm Learning Right Now", "Share what you're currently learning and why you chose it.", "short"],
    ["🏫", "The Course Worth Every Penny", "Describe a course or program that paid for itself, and what made it work.", "atomic"],
  ],
};


/** Packs: each theme presented as a themed bundle of prompts. */
const EVERYDAY_PACKS: Record<string, { emoji: string; description: string }> = {
  Traits: { emoji: "🧭", description: "Character, habits of mind, and what sets people apart." },
  Milestones: { emoji: "🎂", description: "Birthdays, anniversaries, and looking back on a year." },
  Tools: { emoji: "🧰", description: "The tools, stacks, and shortcuts behind your results." },
  Reasons: { emoji: "💡", description: "The real why behind what you do (and don't do)." },
  Mistakes: { emoji: "🚧", description: "Expensive lessons, recoveries, and what to avoid." },
  Habits: { emoji: "⏰", description: "Routines, rituals, and the small things that compound." },
  Advice: { emoji: "🎯", description: "The best (and worst) advice, passed on." },
  Beliefs: { emoji: "🔥", description: "Opinions, principles, and myths worth busting." },
  Stories: { emoji: "📖", description: "Origin stories, low points, and turning points." },
  Frameworks: { emoji: "🗺️", description: "Processes, checklists, and models you can teach." },
  Predictions: { emoji: "🔮", description: "Where your industry is heading, and your bets." },
  Resources: { emoji: "📚", description: "Books, people, and courses worth sharing." },
};

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Sections group the packs, the way the library is shown on the Prompts tab. */
export const PROMPT_SECTIONS: { name: string; description: string; packs: string[] }[] = [
  ...LIBRARY.map((sec) => ({ name: sec.name, description: sec.description, packs: sec.packs.map((p) => p.name) })),
  { name: "Everyday Topics", description: "Traits, milestones, habits, beliefs, and more.", packs: Object.keys(THEMES) },
];

export const PROMPT_PACKS: Record<string, { emoji: string; description: string }> = {
  ...Object.fromEntries(LIBRARY.flatMap((sec) => sec.packs.map((p) => [p.name, { emoji: p.emoji, description: p.description }]))),
  ...EVERYDAY_PACKS,
};

export const PROMPT_THEMES = PROMPT_SECTIONS.flatMap((s) => s.packs);

export const PROMPTS: TopicPrompt[] = [
  ...LIBRARY.flatMap((sec) =>
    sec.packs.flatMap((pk) =>
      pk.rows.map(([title, prompt, format], i) => ({ key: `${slug(pk.name)}-${i + 1}-${slug(title)}`, emoji: pk.emoji, title, prompt, theme: pk.name, format })),
    ),
  ),
  ...Object.entries(THEMES).flatMap(([theme, rows]) =>
    rows.map(([emoji, title, prompt, format]) => ({ key: slug(`${theme}-${title}`), emoji, title, prompt, theme, format })),
  ),
];

export const findPrompt = (key: string | null | undefined) => PROMPTS.find((p) => p.key === key);
