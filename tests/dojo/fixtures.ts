import type { GenerationResult } from "@/lib/dojo/schema";

export function validGeneration(): GenerationResult {
  return {
    analysis: {
      objective: "Get more leads",
      user_role: "Owner",
      task: "Marketing campaign",
      desired_outcome: "Booked estimates",
      audience: "Homeowners",
      industry: "Construction",
      expertise: "Local marketing",
      context: "",
      constraints: [],
      tone: "Friendly",
      output_format: "Plan",
      success_criteria: ["Clear CTA"],
      known_facts: ["Construction business"],
    },
    assumptions: [{ field: "budget", assumption: "Small budget", impact: "Channel mix" }],
    missing_context: [{ field: "area", question: "Service area?", why_it_matters: "Targeting" }],
    recommended: { title: "Campaign", prompt: "## Role\nYou are a marketer.\n\n## Task\nPlan a campaign for {{company_name}}.", sections_used: ["Role", "Task"] },
    alternatives: [
      { kind: "concise", title: "Short", approach: "Shorter", prompt: "Plan a campaign." },
      { kind: "comprehensive", title: "Full", approach: "Deeper", prompt: "Plan a detailed campaign with steps." },
      { kind: "creative", title: "Angle", approach: "Referral-led", prompt: "Design a referral-first campaign." },
    ],
    explanation: { summary: "Role + task + format.", techniques: [{ technique: "Role", why: "Expertise" }] },
    next_steps: [{ label: "Add examples", kind: "refinement", instruction: "Add an example." }],
    variables: [{ name: "company_name", description: "Your company" }],
  };
}
