/** Gonka's DeepSeek endpoint may include a leading <think> block in content. */
export function parseModelJson(content: string): unknown {
  let value = content.trim();
  if (value.startsWith('<think>')) {
    const end = value.indexOf('</think>');
    if (end < 0) throw new Error('Incomplete reasoning block.');
    value = value.slice(end + 8).trim();
  }
  if (value.startsWith('```')) {
    if (!/^```(?:json)?\s[\s\S]*\s```$/.test(value))
      throw new Error('Incomplete JSON fence.');
    value = value.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  }
  return JSON.parse(value);
}
