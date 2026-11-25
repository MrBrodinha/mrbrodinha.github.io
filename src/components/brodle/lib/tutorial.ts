export type TutorialContext = { maxHints: number; finished: boolean; hasAttempts: boolean };
export type TutorialStep = { id: string; title: string; description: string; selector?: string; reveal?: string };

export function tutorialSteps({ maxHints, finished, hasAttempts }: TutorialContext): TutorialStep[] {
  return [
    { id: 'song', title: 'The melody to rebuild', description: 'The title and source identify the melody to reconstruct. Enter its notes in order on the piano, including the original octaves. Rhythm and rests are already filled in. There is one set of rules; using optional help is recorded in your shared result.' },
    { id: 'difficulty', title: 'How challenging is this melody?', description: 'Very Easy, Easy, Medium, Hard, and Very Hard estimate how challenging the pitches are to reconstruct. Note count and pitch variety matter most; pitch span and interval jumps also contribute. Rhythm and rests are already filled in. Difficulty does not change the rules or available hints.' },
    ...(!finished ? [{ id: 'staff', title: 'Build and edit your guess', description: 'Your piano notes appear on this staff. Select a note, then press a piano key to replace it. Every note must match the original pitch and octave to win. A notice above the sheet helps when your whole melody is shifted. Listen plays your current guess without submitting it.' }] : []),
    { id: 'keyboard', title: 'Play the notes here', description: finished
      ? 'The piano is now yours to play freely. Replay the victory arrangement from the result panel to see and hear the complete melody.'
      : 'Tap a key to add a note, or hold it to sustain the sound. The keyboard shows only the complete C-to-C octaves needed for this melody. On phones, the Lower octave and Higher octave buttons above the keys switch pages when needed.' },
    { id: 'settings', title: 'Make the piano yours', description: finished
      ? 'Switch between A–G and Dó–Si note names, choose an instrument, and adjust the volume here.'
      : 'Free play lets you try keys without changing your guess; turn it off to continue entering notes. You can also switch between A–G and Dó–Si note names, choose an instrument, and adjust the volume.' },
    ...(!finished ? [{ id: 'hints', title: 'Two separate ways to get help', description: (maxHints > 0
      ? `Add note permanently reveals the next correct note, up to ${maxHints} ${maxHints === 1 ? 'note' : 'notes'} in this puzzle. `
      : 'This short melody has no note reveals. ')
      + 'Play song lets you hear the challenge without adding notes or spending a note hint. Note hints and song listening are recorded in your shared result.' }] : []),
    ...(!finished ? [{ id: 'submit', title: 'Check your melody', description: 'Fill every note, then press Submit. Green means correct, ↑ means try higher, and ↓ means try lower. Correct notes stay fixed, and later guesses must respect the pitch limits learned from earlier attempts. Remove last note (or Backspace) removes the last entry; Clear resets the draft while keeping revealed notes and learned pitch limits. Change at least one note before resubmitting the same guess.' }] : []),
    ...(hasAttempts ? [{ id: 'attempts', title: 'Learn from your attempts', description: finished
      ? 'Review your latest result and previous guesses here. View details to see each note’s feedback, browse earlier attempts, or use Replay to hear a guess again.'
      : 'Your latest result and previous guesses live here. View details to see each note’s feedback. Replay a guess to hear it, or copy it to your draft to improve it. Copied notes outside their allowed range must be corrected before submitting.' }] : []),
    ...(finished ? [{ id: 'result', title: 'Your result', description: 'You found the melody! Play melody replays the full victory arrangement. Share copies or sends your result, including any note hints or song listening used.' }] : []),
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
