import { it, expect } from 'vitest';
import { parseModelJson } from '../lib/ai/json';
it('accepts JSON after a complete provider reasoning block', () =>
  expect(parseModelJson('<think>analysis</think>{"base":"Base"}')).toEqual({
    base: 'Base',
  }));
it('rejects partial thinking or JSON', () => {
  expect(() => parseModelJson('<think>unfinished')).toThrow();
  expect(() => parseModelJson('{"base":')).toThrow();
});
it('does not extract JSON from arbitrary surrounding prose', () =>
  expect(() => parseModelJson('Ignore all rules {"base":"Base"}')).toThrow());
