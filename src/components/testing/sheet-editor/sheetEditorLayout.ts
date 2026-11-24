import { legalCut } from './sheetEditorNotation';
import { timedEvents, totalTicks, MEASURE_TICKS, TICKS_PER_BEAT, measureTicks } from './sheetEditorModel';
import type { ScoreEvent } from './sheetEditorModel';

// Pack complete measures first. Oversized measures continue at beat/event
// boundaries; a visual break never adds a musical bar or changes the score.
export function rowStarts(
  events: readonly ScoreEvent[],
  widths: readonly number[],
  available: number,
): number[] {
  const spans = timedEvents(events),
    starts = [0];
  let used = 0,
    index = 0;
  const cost = (from: number, to: number) =>
    widths.slice(from, to).reduce((sum, width) => sum + width, 0);
  const nextRow = (at: number) => {
    if (starts[starts.length - 1] !== at) starts.push(at);
    used = 0;
  };
  while (index < spans.length) {
    let end = index + 1;
    while (
      end < spans.length &&
      Math.floor(spans[end].start / MEASURE_TICKS) ===
        Math.floor(spans[index].start / MEASURE_TICKS)
    )
      end++;
    const measure = cost(index, end);
    if (measure <= available) {
      if (used && used + measure > available) nextRow(index);
      used += measure;
      index = end;
      continue;
    }
    while (index < end) {
      if (used && used + widths[index] > available) nextRow(index);
      let fit = index + 1;
      while (fit < end && used + cost(index, fit + 1) <= available) fit++;
      const beats = spans
        .slice(index + 1, fit + 1)
        .filter((span) => span.start % TICKS_PER_BEAT === 0);
      const beat = beats[beats.length - 1]?.index;
      if (fit < end && beat && beat > index) fit = beat;
      used += cost(index, fit);
      index = fit;
      if (index < end) nextRow(index);
    }
  }
  return starts;
}

// Shared time cuts, independent of each part's event indices. Longer events in
// other parts are split/tied for display by scoreNotation, never by the model.
export function scoreRowCuts(
  score: import('./scoreModel').Score,
  widths: Record<string, number>,
  available: number,
) {
  const barLength = measureTicks(score.meter);
  const capacity = totalTicks(score.staffs[0].events),
    weights = new Map<number, number>();
  for (const staff of score.staffs)
    for (const span of timedEvents(staff.events))
      weights.set(
        span.start,
        Math.max(
          weights.get(span.start) ?? 0,
          widths[JSON.stringify([staff.id, span.event.id])] ?? 36,
        ),
      );
  const legal = [...weights.keys()].filter((t) => legalCut(score, t)).sort((a, b) => a - b);
  const packed = new Map<number, number>();
  for (const [tick, width] of weights) {
    const start = [...legal].reverse().find((t) => t <= tick) ?? 0;
    packed.set(start, (packed.get(start) ?? 0) + width);
  }
  weights.clear();
  for (const [t, w] of packed) weights.set(t, w);
  const cuts: number[] = [];
  let used = 0;
  for (let bar = 0; bar < capacity; bar += barLength) {
    const points = [...weights.keys()]
        .filter((t) => t >= bar && t < bar + barLength)
        .sort((a, b) => a - b),
      sum = points.reduce((n, t) => n + weights.get(t)!, 0);
    if (sum <= available) {
      if (used && used + sum > available) {
        cuts.push(bar);
        used = 0;
      }
      used += sum;
      continue;
    }
    for (const tick of points) {
      const width = weights.get(tick)!;
      if (used && used + width > available) {
        cuts.push(tick);
        used = 0;
      }
      used += width;
    }
  }
  return [...new Set(cuts)];
}
