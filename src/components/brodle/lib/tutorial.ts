export type TutorialContext = { exactOnly: boolean; maxHints: number; finished: boolean; hasAttempts: boolean };
export type TutorialStep = { id: string; title: string; description: string };

export function tutorialSteps({ exactOnly, maxHints, finished, hasAttempts }: TutorialContext): TutorialStep[] {
  return [
    { id: 'song', title: 'The melody to rebuild', description: 'The title and artist tell you which song to reconstruct. Use the piano to find its notes and octaves. Rhythm and rests are already filled in.' },
    { id: 'difficulty', title: 'How challenging is this melody?', description: 'Easy, Medium, and Hard estimate the melody’s complexity from its note count, unique pitches, octave range, and interval jumps. This rating is separate from your game mode.' },
    { id: 'mode', title: 'Your game mode', description: exactOnly
      ? 'You’re playing Hard: every note must match the exact pitch and octave. All keys in the melody’s range stay available. Submitting a guess locks your mode for this puzzle.'
      : 'Casual remembers higher/lower feedback and keeps confirmed notes correct. A matching melody at a consistently shifted pitch or octave also wins. Submitting a guess or using a hint locks your mode for this puzzle.' },
    ...(!finished ? [{ id: 'staff', title: 'Build and edit your guess', description: 'Your piano notes appear on this staff. Select a note, then press a piano key to replace it. Listen, just above the staff, plays your current guess without submitting it.' }] : []),
    { id: 'keyboard', title: 'Play the notes here', description: finished
      ? 'The piano is now yours to play freely. Replay the victory arrangement from the result panel to see and hear the complete melody.'
      : 'Tap a key to add a note, or hold it to sustain the sound. The keyboard shows only the complete C-to-C octaves needed for this melody. On phones, the Lower octave and Higher octave buttons above the keys switch pages when needed.' },
    { id: 'settings', title: 'Make the piano yours', description: finished
      ? 'Switch between A–G and Dó–Si note names, choose an instrument, and adjust the volume here.'
      : 'Free play lets you try keys without changing your guess; turn it off to continue entering notes. You can also switch between A–G and Dó–Si note names, choose an instrument, and adjust the volume.' },
    ...(!finished && !exactOnly ? [{ id: 'hints', title: 'Two separate ways to get help', description: (maxHints > 0
      ? `Add note permanently reveals the next correct note, up to ${maxHints} ${maxHints === 1 ? 'note' : 'notes'} in this puzzle. `
      : 'This short melody has no note reveals. ')
      + 'Play song lets you hear the challenge without adding notes or spending a note hint. Using a hint immediately locks this puzzle to Casual, even before your first guess.' }] : []),
    ...(!finished ? [{ id: 'submit', title: 'Check your melody', description: 'Fill every note, then press Submit. Green means correct, ↑ means try higher, and ↓ means try lower. Remove last note (or Backspace) undoes the last entry; Clear resets the draft while keeping revealed notes and Casual’s learned limits.' }] : []),
    ...(hasAttempts ? [{ id: 'attempts', title: 'Learn from your attempts', description: finished
      ? 'Review your latest result and previous guesses here. View details to see each note’s feedback, browse earlier attempts, or use Replay to hear a guess again.'
      : 'Your latest result and previous guesses live here. View details to see each note’s feedback. Replay a guess to hear it, or copy it to your draft to improve it. In Casual, copied notes outside their allowed range must be corrected before submitting.' }] : []),
    ...(finished ? [{ id: 'result', title: 'Your result', description: 'You found the melody! Play melody replays the full victory arrangement. Share copies or sends your result, including your mode and any note hints used.' }] : []),
  ];
}

export type TourRect = { left: number; top: number; width: number; height: number };
export type TourSize = { width: number; height: number };

// Keep the help card beside the highlighted area whenever the viewport permits.
export function placeTutorialCard(target: TourRect | null, card: TourSize, viewport: TourSize) {
  const margin = 16;
  const gap = 16;
  const clamp = (value: number, size: number, limit: number) => Math.max(margin, Math.min(value, limit - size - margin));
  const centered = { left: clamp((viewport.width - card.width) / 2, card.width, viewport.width),
    top: clamp((viewport.height - card.height) / 2, card.height, viewport.height) };
  if (!target) return centered;
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  if (viewport.width > 700 && right + gap + card.width <= viewport.width - margin) {
    return { left: right + gap, top: clamp(target.top, card.height, viewport.height) };
  }
  if (viewport.width > 700 && target.left - gap - card.width >= margin) {
    return { left: target.left - gap - card.width, top: clamp(target.top, card.height, viewport.height) };
  }
  const left = clamp(target.left + (target.width - card.width) / 2, card.width, viewport.width);
  if (bottom + gap + card.height <= viewport.height - margin) return { left, top: Math.max(margin, bottom + gap) };
  if (target.top - gap - card.height >= margin) return { left, top: target.top - gap - card.height };
  return { left: centered.left, top: Math.max(margin, viewport.height - card.height - margin) };
}
