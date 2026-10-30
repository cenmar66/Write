import { Mark } from "@tiptap/core";

/**
 * Marks text that AI wrote and you haven't touched yet (like iA Writer's Authorship).
 * Anything you type is yours: the editor strips this mark from your own edits.
 * It's invisible in exports.
 */
export const AiText = Mark.create({
  name: "aiText",
  inclusive: false,
  excludes: "",
  parseHTML: () => [{ tag: "span[data-ai]" }],
  renderHTML: () => ["span", { "data-ai": "" }, 0],
  renderMarkdown: (node, h) => h.renderChildren(node),
});
