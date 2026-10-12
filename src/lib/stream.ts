/** POSTs JSON and calls onText with the growing reply as it streams in. */
export async function streamFetch(
  url: string,
  body: unknown,
  onText: (soFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) throw new Error("You've been signed out. Refresh and sign in again.");
  if (!res.ok || !res.body) throw new Error("The AI request failed. Try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  return text;
}
