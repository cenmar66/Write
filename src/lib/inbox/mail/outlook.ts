// Microsoft 365 / Outlook adapter: NOT IMPLEMENTED.
// The adapter boundary exists so Microsoft Graph can be added without touching the
// sync engine (Graph: /me/messages, delta queries for incremental sync, Mail.Read /
// Mail.ReadWrite / Mail.Send scopes). Until OAuth, sync, tests and account management
// exist, the UI shows Outlook as "planned" and the server refuses to connect it.

import { ProviderError, type MailProvider } from "./provider";

const no = () => {
  throw new ProviderError("Outlook / Microsoft 365 isn't supported yet.", "not_implemented");
};

export const outlookProvider: MailProvider = {
  id: "outlook",
  capabilities: () => ({ read: false, search: false, modify: false, send: false }),
  listPage: async () => no(),
  listChanges: async () => no(),
  getMessages: async () => no(),
  search: async () => no(),
  modify: async () => no(),
  ensureLabel: async () => no(),
  send: async () => no(),
  revoke: async () => undefined,
  webLink: () => null,
};
