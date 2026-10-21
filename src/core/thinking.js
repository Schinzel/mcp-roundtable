/** OpenRouter's effort levels, lowest first. */
export const THINKING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];

/**
 * The level sent to the model. If the model lacks the requested level, it becomes the nearest on the scale,
 * and the higher one on a tie. See CLAUDE.md, thinking.
 * @param {string | undefined} requested level from THINKING_LEVELS
 * @param {string[] | undefined} supported the model's levels according to the catalog
 * @returns {string | undefined} undefined when nothing should be sent
 */
export function resolveThinking(requested, supported) {
  if (!requested || !supported?.length) return undefined;
  const target = THINKING_LEVELS.indexOf(requested);
  let best;
  let bestDistance = Infinity;
  for (const level of supported) {
    const index = THINKING_LEVELS.indexOf(level);
    if (index < 0) continue;
    const distance = Math.abs(index - target);
    if (distance < bestDistance || (distance === bestDistance && index > THINKING_LEVELS.indexOf(best))) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}
