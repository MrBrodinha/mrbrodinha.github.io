import { scoreGuess } from './musicGame';
import type { MelodyStep } from './musicGame';
import { canSubmitGuess, copyLastAttempt, emptyProgress, parseProgress } from './gameProgress';
import type { GameProgress } from './gameProgress';

export type PracticeLesson = {
  id: string;
  title: string;
  description: string;
  target: readonly number[];
  melody: MelodyStep[];
  showNotes: boolean;
};
export const PRACTICE_BPM = 96;

const lesson = (id: string, title: string, description: string, target: number[], showNotes: boolean): PracticeLesson => ({
  id, title, description, target, showNotes,
  melody: target.map(midi => ({ midi, beats: 1, length: '1', rhythm: 'Quarter note' })),
});

export const PRACTICE_LESSONS: readonly PracticeLesson[] = [
  lesson('first-notes', 'Play your first melody', 'Listen to the example, then play the four notes shown below in order. The letter is the note name; the number is its octave. Fill the staff and press Submit.', [72, 74, 76, 77], true),
  lesson('fix-notes', 'Follow the feedback', 'This example already has two mistakes. Select the note marked ↑ and play D5 to raise it. Select the note marked ↓ and play E5 to lower it. Green notes stay correct. Then submit your repaired melody.', [72, 74, 76, 77], true),
  lesson('by-ear', 'Try one by ear', 'Now the note names are hidden. Listen to this new four-note melody and rebuild it on the piano. Play song is always available; Add note can reveal a note when you need help.', [72, 76, 74, 72], false),
];

export function practiceProgress(lesson: PracticeLesson) {
  if (lesson.id !== 'fix-notes') return emptyProgress();
  const notes = [72, 73, 78, 77];
  const saved = parseProgress(JSON.stringify({
    attempts: [notes], attemptIds: ['practice-feedback-example'], guess: [],
  }), lesson.target);
  return copyLastAttempt(saved, lesson.target);
}

export function submitPracticeGuess(progress: GameProgress, lesson: PracticeLesson): GameProgress {
  if (!canSubmitGuess(progress, lesson.target)) return progress;
  return { ...progress, guess: lesson.target.slice(0, progress.hintsUsed),
    attempts: [...progress.attempts, {
      id: crypto.randomUUID(), notes: [...progress.guess],
      feedback: scoreGuess(progress.guess, lesson.target), hintsUsed: progress.hintsUsed,
    }], selectedAttempt: progress.attempts.length };
}
