// Starter templates: original, fill-in-the-blank prompts. Fields are {{snake_case}}.
// Construction templates never supply code requirements, prices, measurements or site
// conditions; they ask for them and tell the AI not to invent them.

export type TemplateFieldDef = { key: string; label: string; placeholder: string; help: string; required: boolean };
export type StarterTemplate = { id: string; title: string; category: TemplateCategory; description: string; fields: TemplateFieldDef[]; body: string };

export const TEMPLATE_CATEGORIES = ["Business & Strategy", "Marketing & Sales", "Writing & Publishing", "Technology & Software", "Construction & Restoration", "Personal Development"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

const f = (key: string, label: string, placeholder: string, help = "", required = true): TemplateFieldDef => ({ key, label, placeholder, help, required });

const NO_INVENT = "Do not invent facts, figures, prices, quotes or credentials. Where information is missing, write [NEEDED: description] instead.";
const CONSTRUCTION_RULE =
  "Do not invent building-code requirements, permit rules, prices, quantities, measurements, materials or site conditions. Use only what is provided below; where something is missing or must be verified on site or with the local authority, mark it [VERIFY: description].";

export const STARTER_TEMPLATES: StarterTemplate[] = [
  // ---- Business & Strategy ----------------------------------------------------------
  {
    id: "business-plan",
    title: "Business plan outline",
    category: "Business & Strategy",
    description: "A structured first draft of a business plan from what you know today.",
    fields: [f("business", "Business idea", "Mobile pet grooming van"), f("market", "Target market", "Busy dog owners in the suburbs"), f("stage", "Stage", "Pre-launch, self-funded"), f("known_numbers", "Known numbers (optional)", "Startup budget $40k", "Only real figures", false)],
    body: `Act as an experienced small-business advisor.

Help me draft a business plan for: {{business}}
Target market: {{market}}
Current stage: {{stage}}
Known figures: {{known_numbers}}

Produce these sections: executive summary, problem and solution, target customer, competition and positioning, revenue model, marketing plan, operations, key risks, 90-day milestones.
For each section write 3-6 concise bullet points. ${NO_INVENT}
Finish with the five questions I should answer before showing this plan to a lender or investor.`,
  },
  {
    id: "competitive-analysis",
    title: "Competitive analysis",
    category: "Business & Strategy",
    description: "Compare yourself with named competitors using only the information you supply.",
    fields: [f("company", "Your company", "Northside Plumbing"), f("competitors", "Competitors and what you know", "AcmePlumb: cheaper, slow response; FlowPro: 24/7, poor reviews"), f("customer", "Customer you compete for", "Homeowners with emergency leaks")],
    body: `You are a strategy analyst. Compare {{company}} with these competitors, using only the information below:
{{competitors}}

The customer we compete for: {{customer}}

1. Build a comparison table: price position, speed, quality signals, differentiation, weaknesses.
2. Identify where {{company}} can win and where it is exposed.
3. Recommend three positioning moves, each with the evidence from the information above that supports it.
${NO_INVENT} Clearly separate facts I provided from your inferences.`,
  },
  {
    id: "decision-matrix",
    title: "Strategic decision helper",
    category: "Business & Strategy",
    description: "Weigh options against criteria and surface the trade-offs.",
    fields: [f("decision", "Decision", "Open a second location or expand online sales"), f("options", "Options", "A) second store B) e-commerce C) wait a year"), f("criteria", "What matters most", "Cash risk, owner time, growth"), f("constraints", "Constraints", "Budget $60k, decide by March", "", false)],
    body: `Help me make this decision: {{decision}}

Options: {{options}}
Criteria that matter most to me: {{criteria}}
Constraints: {{constraints}}

Steps:
1. Restate the decision and what a good outcome looks like.
2. Score each option against each criterion (1-5) in a table, with a one-line reason per score.
3. Name the biggest uncertainty for each option and how I could reduce it cheaply.
4. Recommend an option, and say what would change your recommendation.
Keep your reasoning visible and say where you are assuming.`,
  },
  {
    id: "process-optimization",
    title: "Process optimization",
    category: "Business & Strategy",
    description: "Find bottlenecks and quick wins in a recurring process.",
    fields: [f("process", "Process", "Quote-to-invoice for service calls"), f("steps", "Current steps", "Call comes in → tech visits → paper quote → office types it → email…"), f("pain", "What goes wrong", "Quotes take 3 days, details get lost")],
    body: `Act as an operations consultant. Analyze this process: {{process}}

Current steps:
{{steps}}

Known problems: {{pain}}

Deliver:
- A map of the current process with each hand-off marked.
- The top three bottlenecks and why they happen.
- Quick wins (this week), medium changes (this quarter) and what to measure for each.
- A redesigned step list.
Keep recommendations realistic for a small team; flag anything that needs new software.`,
  },
  {
    id: "executive-summary",
    title: "Executive summary",
    category: "Business & Strategy",
    description: "Condense a long document into a one-page summary for decision-makers.",
    fields: [f("audience", "Who reads it", "Board of directors"), f("decision_needed", "Decision or action needed", "Approve the Q3 budget", "", false), f("document", "Paste the document", "…")],
    body: `Write a one-page executive summary of the document below for {{audience}}.

Structure: the bottom line in two sentences; key findings (max 5 bullets); risks; recommendation; the decision needed: {{decision_needed}}.
Use only information from the document. If something important is unclear or missing, list it under "Open questions".

<document>
{{document}}
</document>`,
  },
  // ---- Marketing & Sales --------------------------------------------------------------
  {
    id: "ad-campaign",
    title: "Advertising campaign plan",
    category: "Marketing & Sales",
    description: "Campaign concept, messages and channel plan for one offer.",
    fields: [f("business", "Business", "Family-owned roofing company"), f("offer", "Offer", "Free roof inspection after storms"), f("audience", "Audience", "Homeowners 35-65 in our county"), f("budget", "Budget and timeframe", "$3,000 over 6 weeks", "", false), f("channels", "Channels you use", "Facebook, Google, yard signs", "", false)],
    body: `You are a direct-response marketing strategist for local service businesses.

Plan an advertising campaign for {{business}}.
Offer: {{offer}}
Audience: {{audience}}
Budget and timeframe: {{budget}}
Channels available: {{channels}}

Include: the core message and three alternative angles; ad copy for each channel (headline, body, call to action); a simple weekly schedule; what to track and the target for each metric; a list of claims I must be able to prove before running the ads.
${NO_INVENT}`,
  },
  {
    id: "cold-email",
    title: "Cold email outreach",
    category: "Marketing & Sales",
    description: "A short outreach sequence that sounds human, not salesy.",
    fields: [f("sender", "Who you are", "Owner of a commercial cleaning company"), f("prospect", "Prospect type", "Property managers of office buildings"), f("problem", "Problem you solve", "Unreliable night cleaning crews"), f("proof", "Real proof points", "12 buildings served, 98% retention", "Only true facts", false)],
    body: `Write a 3-email cold outreach sequence.
Sender: {{sender}}
Prospect: {{prospect}}
Problem we solve: {{problem}}
Proof points (use only these): {{proof}}

Email 1: a specific observation about their likely problem and one question. Email 2 (3 days later): one proof point and a low-commitment offer. Email 3 (5 days later): a polite close-the-loop.
Rules: under 120 words each, plain language, no hype words, one clear call to action, a subject line for each. Put {{first_name}} and {{prospect_company}} as placeholders.`,
  },
  {
    id: "customer-follow-up",
    title: "Customer follow-up",
    category: "Marketing & Sales",
    description: "Follow up after a quote, visit or purchase without being pushy.",
    fields: [f("situation", "Situation", "Sent a quote for a kitchen remodel 2 weeks ago, no reply"), f("relationship", "Relationship so far", "One site visit, friendly"), f("goal", "Goal", "Get a yes/no or a call")],
    body: `Write three short follow-up messages for this situation: {{situation}}
Relationship so far: {{relationship}}
Goal: {{goal}}

Give one email, one text message (under 300 characters) and one voicemail script (under 30 seconds). Tone: warm, confident, never guilt-tripping. Make it easy to say no. Use {{customer_name}} as a placeholder.`,
  },
  {
    id: "social-calendar",
    title: "Social media content plan",
    category: "Marketing & Sales",
    description: "Two weeks of posts with a mix of formats and purposes.",
    fields: [f("brand", "Brand and voice", "Neighborhood bakery, cheerful and local"), f("platforms", "Platforms", "Instagram and Facebook"), f("goals", "Goals", "Pre-orders for holiday pies"), f("themes", "Topics you can talk about", "Behind the scenes, recipes, staff", "", false)],
    body: `Create a 2-week social media plan for {{brand}} on {{platforms}}.
Goal: {{goals}}
Topics available: {{themes}}

For each post give: day, platform, format (photo, carousel, short video, story), the hook (first line), the caption, and the call to action. Mix education, behind-the-scenes, social proof (marked [NEEDED: real review] where you'd need one) and promotion, with no more than one promotional post in three. Output as a table.`,
  },
  {
    id: "seo-article",
    title: "SEO article brief and draft",
    category: "Marketing & Sales",
    description: "Search-focused article that answers the reader's real question.",
    fields: [f("topic", "Topic", "How long does a roof replacement take"), f("audience", "Reader", "Homeowners researching a replacement"), f("business", "Your business and area", "Roofing contractor in Austin, TX"), f("keywords", "Keywords to include", "roof replacement time, re-roof", "", false)],
    body: `Write a helpful, search-friendly article on: {{topic}}
Reader: {{audience}}
Publisher: {{business}}
Keywords to use naturally: {{keywords}}

First output a brief: search intent, the reader's main question, an outline with H2/H3 headings, and a meta title (≤60 characters) and description (≤155 characters).
Then write the article (900-1,300 words): answer the main question in the first paragraph, use short sections, include an FAQ with 4 questions. ${NO_INVENT} Don't stuff keywords.`,
  },
  {
    id: "sales-script",
    title: "Sales call script",
    category: "Marketing & Sales",
    description: "Discovery-first call script with objection handling.",
    fields: [f("product", "Product or service", "Annual HVAC maintenance plan"), f("buyer", "Buyer", "Homeowner who called about a repair"), f("objections", "Common objections", "Too expensive, I'll think about it")],
    body: `Write a phone sales script for offering {{product}} to {{buyer}}.

Structure: friendly opener; 4-6 discovery questions; how to connect their answers to the offer; a clear ask; responses to these objections: {{objections}}; a graceful close if they say no.
Keep it conversational, with notes in [brackets] for the salesperson. Never pressure or use false urgency.`,
  },
  // ---- Writing & Publishing ----------------------------------------------------------
  {
    id: "article-outline",
    title: "Article outline",
    category: "Writing & Publishing",
    description: "A clear, logical outline before you write.",
    fields: [f("topic", "Topic or working title", "Why small teams should write things down"), f("reader", "Reader", "Founders of 5-20 person companies"), f("angle", "Your angle or thesis", "Writing is the cheapest management tool"), f("length", "Target length", "1,500 words", "", false)],
    body: `Create an outline for an article on {{topic}} for {{reader}}.
Thesis: {{angle}}
Target length: {{length}}

Give: three title options; a one-sentence promise to the reader; section headings in order with 2-3 bullet points each and the purpose of each section; where a story, example or data point would help (marked [ADD: what kind]); a closing that returns to the thesis.`,
  },
  {
    id: "chapter-planning",
    title: "Nonfiction chapter plan",
    category: "Writing & Publishing",
    description: "Plan a chapter's argument, structure and supporting material.",
    fields: [f("book", "Book premise", "A practical guide to calm leadership"), f("chapter", "Chapter topic", "Handling conflict on a team"), f("reader", "Reader", "New managers"), f("material", "Material you have", "Two personal stories, a framework I use", "", false)],
    body: `Help me plan a nonfiction chapter.
Book premise: {{book}}
Chapter: {{chapter}}
Reader: {{reader}}
Material I already have: {{material}}

Produce: the chapter's central question and answer; a section-by-section plan (purpose, key points, which of my material fits where); gaps where I need research or a story (do not fill them with invented ones); a strong opening hook idea and a closing that leads to the next chapter.`,
  },
  {
    id: "manuscript-edit",
    title: "Manuscript editing pass",
    category: "Writing & Publishing",
    description: "Developmental and line-level feedback on a passage.",
    fields: [f("goal", "What the passage should do", "Persuade skeptical readers that habits beat goals"), f("voice", "Voice to preserve", "Conversational, wry", "", false), f("text", "Paste the passage", "…")],
    body: `Act as a careful developmental and line editor. The passage below should: {{goal}}. Preserve this voice: {{voice}}.

Give feedback in three layers:
1. Big picture: does it achieve its goal? What's missing or in the wrong order?
2. Paragraph level: specific suggestions, quoting the sentence you mean.
3. Line edits: a lightly edited version with changes marked in **bold**.
Don't rewrite into your own style; keep the author's voice.

<passage>
{{text}}
</passage>`,
  },
  {
    id: "fact-check-plan",
    title: "Fact-checking plan",
    category: "Writing & Publishing",
    description: "List every checkable claim and how to verify it — without judging truth itself.",
    fields: [f("text", "Paste the draft", "…")],
    body: `Read the draft below and create a fact-checking plan. Do not state whether claims are true; you may not have reliable information.

For every checkable claim (numbers, dates, names, quotes, causal claims, superlatives) list in a table: the claim as written, the type of claim, the kind of source that could verify it (primary sources first), and risk if wrong (low/medium/high). Then list vague claims that should be made specific or cut.

<draft>
{{text}}
</draft>`,
  },
  {
    id: "style-analysis",
    title: "Writing style analysis",
    category: "Writing & Publishing",
    description: "Describe a writing style precisely enough to reuse it.",
    fields: [f("samples", "Paste 2-3 writing samples", "…")],
    body: `Analyze the writing style of the samples below. Describe: sentence length and rhythm, vocabulary level, tone, use of humor, structure of paragraphs, openings and closings, recurring phrases, and what the writer avoids. Quote short examples for each point.

Then write a "style guide" of 8-12 rules someone could follow to write in this style, and a 100-word paragraph on a neutral topic that demonstrates it.

<samples>
{{samples}}
</samples>`,
  },
  {
    id: "content-repurpose",
    title: "Content repurposing",
    category: "Writing & Publishing",
    description: "Turn one long piece into several formats.",
    fields: [f("formats", "Formats wanted", "LinkedIn post, newsletter blurb, 5 tweets, a 60-second video script"), f("audience", "Audience", "Small-business owners", "", false), f("source", "Paste the original content", "…")],
    body: `Repurpose the content below into these formats: {{formats}}. Audience: {{audience}}.

For each format: adapt the length and structure to the format, lead with the most interesting idea for that audience, and keep every claim faithful to the original (no new facts). Label each output clearly.

<original>
{{source}}
</original>`,
  },
  // ---- Technology & Software ---------------------------------------------------------
  {
    id: "software-requirements",
    title: "Software requirements",
    category: "Technology & Software",
    description: "Turn an idea into clear, testable requirements.",
    fields: [f("product", "Product idea", "A booking app for a dog groomer"), f("users", "Users", "Pet owners and two groomers"), f("must_haves", "Must-haves", "Online booking, reminders, payments"), f("constraints", "Constraints", "Web only, launch in 8 weeks", "", false)],
    body: `Act as a senior product manager. Write a requirements document for: {{product}}
Users: {{users}}
Must-haves: {{must_haves}}
Constraints: {{constraints}}

Include: problem statement; user roles; user stories with acceptance criteria (Given/When/Then); non-functional requirements (security, privacy, performance, accessibility); out of scope; open questions. Number every requirement so it can be referenced. Prefer fewer, clearer requirements.`,
  },
  {
    id: "claude-code-master",
    title: "Claude Code master prompt",
    category: "Technology & Software",
    description: "A complete build brief for an AI coding agent.",
    fields: [f("project", "What to build", "A web app for tracking restoration jobs"), f("stack", "Preferred stack", "Next.js, TypeScript, Supabase", "", false), f("features", "Core features", "Jobs, photos, notes, client portal"), f("quality", "Quality bar", "Tests for main workflows, accessible, mobile friendly", "", false)],
    body: `<role>You are a senior full-stack engineer working autonomously in this repository.</role>

<objective>Build {{project}}.</objective>

<context>
Preferred stack: {{stack}}
Core features: {{features}}
Quality bar: {{quality}}
</context>

<instructions>
1. Inspect the repository first; don't overwrite existing work without understanding it.
2. Write a short plan and task checklist, then build the smallest working vertical slice end to end before polishing.
3. Use real integrations for core features. If credentials are missing, show a clear "configuration required" state; mocks are for automated tests only.
4. After each phase: run the tests, type-check, build, and update the checklist. Never mark unfinished work as complete.
5. Keep secrets server-side; validate all input; enforce per-user data access.
</instructions>

<deliverables>Source code, migrations, tests, README with setup and deployment steps, a list of implemented features and known limitations.</deliverables>`,
  },
  {
    id: "architecture",
    title: "Application architecture",
    category: "Technology & Software",
    description: "Propose an architecture with explicit trade-offs.",
    fields: [f("system", "System to design", "Multi-tenant invoicing SaaS"), f("scale", "Expected scale", "500 businesses, 50k invoices/month"), f("team", "Team and skills", "2 developers, strong in TypeScript"), f("requirements", "Key requirements", "Audit trail, PDF generation, Stripe")],
    body: `Act as a pragmatic software architect. Propose an architecture for {{system}}.
Scale: {{scale}}
Team: {{team}}
Key requirements: {{requirements}}

Cover: components and responsibilities; data model sketch; key flows (as numbered steps); technology choices with the trade-off for each and one alternative; security and tenancy isolation; how it fails and recovers; what to build first. Prefer the simplest design that meets the requirements and say what you'd defer.`,
  },
  {
    id: "debugging",
    title: "Debugging assistant",
    category: "Technology & Software",
    description: "Systematic diagnosis from symptoms, code and errors.",
    fields: [f("symptom", "What's happening", "Login works locally but returns 401 in production"), f("expected", "What should happen", "User stays signed in"), f("tried", "Already tried", "Cleared cookies, checked env vars", "", false), f("evidence", "Code, logs or errors", "…")],
    body: `Help me debug this.
Symptom: {{symptom}}
Expected: {{expected}}
Already tried: {{tried}}

Evidence:
\`\`\`
{{evidence}}
\`\`\`

Work like this: list the most likely causes ranked by probability with the evidence for each; for the top causes, give a quick test that would confirm or rule it out; then propose a fix for the most likely cause and how to verify it. Say clearly when you are guessing, and ask for any specific information that would settle it.`,
  },
  {
    id: "code-review",
    title: "Code review",
    category: "Technology & Software",
    description: "A focused review for correctness, security and clarity.",
    fields: [f("context", "What the change does", "Adds password reset by email"), f("focus", "Focus areas", "Security, edge cases", "", false), f("code", "Paste the diff or code", "…")],
    body: `Review this code change. Purpose: {{context}}. Focus: {{focus}}.

Report findings ordered by severity (critical, major, minor, nit). For each: the location, what's wrong, a concrete failure scenario, and a suggested fix. Then list what's done well. Don't report style preferences as bugs. If something can't be judged without more context, say what you'd need.

\`\`\`
{{code}}
\`\`\``,
  },
  {
    id: "test-cases",
    title: "Test-case generation",
    category: "Technology & Software",
    description: "Thorough test cases for a feature or function.",
    fields: [f("feature", "Feature or function", "Discount code validation at checkout"), f("rules", "Business rules", "One code per order, expires, min spend $50"), f("framework", "Test framework", "Vitest", "", false)],
    body: `Generate test cases for: {{feature}}
Rules: {{rules}}

First list the cases in a table: name, type (happy path, edge, error, security), input, expected result. Cover boundaries, invalid input and combinations of rules. Then write the tests in {{framework}} for the ten most important cases, with clear names and no shared mutable state.`,
  },
  // ---- Construction & Restoration ----------------------------------------------------
  {
    id: "scope-of-work",
    title: "Scope-of-work draft",
    category: "Construction & Restoration",
    description: "Organize field notes into a clear scope of work — without inventing specs.",
    fields: [f("project", "Project type", "Water damage restoration, single-family home"), f("notes", "Field notes and observations", "Kitchen and hallway affected, base cabinets wet…"), f("client", "Client", "Homeowner, insurance claim in progress", "", false), f("exclusions", "Known exclusions", "Contents cleaning", "", false)],
    body: `Act as an experienced construction project manager. Turn my field notes into a draft scope of work for: {{project}}
Client: {{client}}

Field notes (the only source of facts):
{{notes}}

Known exclusions: {{exclusions}}

Organize by area/room and then by trade, as numbered line items in plain language. Add sections for assumptions, exclusions, and items requiring verification.
${CONSTRUCTION_RULE}`,
  },
  {
    id: "estimate-review",
    title: "Estimate review",
    category: "Construction & Restoration",
    description: "Check an estimate for gaps, duplicates and unclear items.",
    fields: [f("scope", "Scope summary", "Re-roof 1-story home, tear-off and replace"), f("estimate", "Paste the estimate line items", "…")],
    body: `Review this estimate against the scope summary. Scope: {{scope}}

Look for: items in the scope that are missing from the estimate; possible duplicates or overlapping items; vague line items that need clearer descriptions or units; quantities that look inconsistent with each other (say why, but don't propose your own quantities); and questions to ask before sending.
Do not judge whether prices are fair or suggest prices. ${CONSTRUCTION_RULE}

<estimate>
{{estimate}}
</estimate>`,
  },
  {
    id: "project-plan",
    title: "Construction project plan",
    category: "Construction & Restoration",
    description: "Phases, dependencies and inspections from a defined scope.",
    fields: [f("scope", "Scope of work", "Bathroom remodel: demo, plumbing relocation, tile…"), f("constraints", "Constraints", "Owner occupied, one bathroom only, start June 1"), f("crew", "Crew and subs", "2-person crew; plumber and electrician subcontracted", "", false)],
    body: `Create a project plan for this scope:
{{scope}}

Constraints: {{constraints}}
Crew and subcontractors: {{crew}}

Give: phases in order with dependencies; which trade does what; points where an inspection may be required (marked [VERIFY with local building department]); long-lead items to order early; owner communication points; and a risk list with mitigations. Express durations only as relative sequence unless I provide durations. ${CONSTRUCTION_RULE}`,
  },
  {
    id: "client-update",
    title: "Client communication",
    category: "Construction & Restoration",
    description: "Clear, calm updates for homeowners, including bad news.",
    fields: [f("situation", "What happened or what to communicate", "Hidden rot found behind shower wall; extra work needed"), f("client", "Client", "Homeowner, first remodel, anxious"), f("next_steps", "Next steps", "Need approval for change order by Friday")],
    body: `Write a message to {{client}} about: {{situation}}
Next steps: {{next_steps}}

Tone: calm, honest, plain language, no jargon without a short explanation. Structure: what we found, what it means for them, options, what we need from them and by when. Keep it under 200 words. Provide an email version and a short text-message version. ${CONSTRUCTION_RULE}`,
  },
  {
    id: "change-order",
    title: "Change-order draft",
    category: "Construction & Restoration",
    description: "A clear change order from the facts you provide.",
    fields: [f("original", "Original scope item", "Install new vanity on existing plumbing"), f("change", "The change and why", "Owner requested double vanity; plumbing must be extended"), f("cost_time", "Cost and schedule impact (your figures)", "Price TBD; adds 2 days", "Leave blank if unknown", false)],
    body: `Draft a change order.
Original scope: {{original}}
Change and reason: {{change}}
Cost and schedule impact (use exactly as given): {{cost_time}}

Sections: description of change, reason, work added/removed, cost impact, schedule impact, assumptions, and signature lines for contractor and owner. If cost or schedule impact isn't given, write [TO BE PRICED] — never estimate it. ${CONSTRUCTION_RULE}`,
  },
  {
    id: "restoration-docs",
    title: "Restoration documentation",
    category: "Construction & Restoration",
    description: "Turn job notes and readings into organized loss documentation.",
    fields: [f("loss", "Type of loss", "Category 2 water loss from washing machine"), f("notes", "Job notes, readings and photo descriptions", "Day 1: moisture readings…"), f("audience", "For whom", "Insurance adjuster")],
    body: `Organize the job notes below into restoration documentation for {{audience}}.
Type of loss: {{loss}}

Notes (the only source of facts):
{{notes}}

Sections: loss summary, affected areas, timeline of actions, monitoring/readings in a table exactly as recorded, equipment used as recorded, photo log descriptions, and outstanding items. Keep a factual, neutral tone. Do not interpret readings beyond what the notes state. ${CONSTRUCTION_RULE}`,
  },
  // ---- Personal Development ----------------------------------------------------------
  {
    id: "learning-plan",
    title: "Learning plan",
    category: "Personal Development",
    description: "A realistic plan to learn a skill with the time you have.",
    fields: [f("skill", "Skill", "Public speaking"), f("level", "Current level", "Nervous beginner"), f("time", "Time available", "3 hours a week for 2 months"), f("goal", "Goal", "Give a 10-minute talk at a conference")],
    body: `Create a learning plan for {{skill}}. My level: {{level}}. Time: {{time}}. Goal: {{goal}}.

Give a week-by-week plan with specific practice activities (not just reading), how to get feedback, a milestone each fortnight, and how I'll know I'm improving. Keep it realistic for the time I have and suggest what to cut if I fall behind.`,
  },
  {
    id: "weekly-review",
    title: "Weekly reflection",
    category: "Personal Development",
    description: "A guided review that turns a messy week into clear next steps.",
    fields: [f("week", "What happened this week", "Missed two deadlines, landed a new client, slept badly"), f("priorities", "Your priorities", "Health, business growth, family time")],
    body: `Guide me through a short weekly review. This week: {{week}}. My priorities: {{priorities}}.

Ask me nothing; instead: summarize the week in three sentences, name what went well and why, what didn't and the likely cause, one pattern to notice, and three concrete commitments for next week, each tied to a priority. Be kind but honest.`,
  },
  {
    id: "difficult-conversation",
    title: "Difficult conversation prep",
    category: "Personal Development",
    description: "Prepare for a hard conversation with empathy and clarity.",
    fields: [f("person", "Who", "A long-time employee"), f("topic", "Topic", "Their performance has slipped"), f("outcome", "Outcome you want", "A clear improvement plan and a good relationship")],
    body: `Help me prepare a difficult conversation with {{person}} about {{topic}}. Desired outcome: {{outcome}}.

Give: an opening line; the key message in one sentence; how they might react and how to respond to each reaction; questions to understand their side; how to agree on next steps; and phrases to avoid. Keep it respectful and direct.`,
  },
];

export function findTemplate(id: string) {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}

/** A natural-language request built from a filled template, for "Customize with AI". */
export function templateToRequest(title: string, filled: string): string {
  return `Improve and tailor this "${title}" prompt for my situation. Keep its structure where it helps.\n\n${filled}`;
}
