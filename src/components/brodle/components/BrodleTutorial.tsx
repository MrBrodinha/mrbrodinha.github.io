import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import GuidedTour from './GuidedTour';
import { tutorialSteps } from '../lib/tutorial';

export default function BrodleTutorial({ maxHints, onOpen, finished = false, hasAttempts = false }: {
  maxHints: number; onOpen: () => void; finished?: boolean; hasAttempts?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const steps = useMemo(() => tutorialSteps({ maxHints, finished, hasAttempts }), [maxHints, finished, hasAttempts]);
  return <GuidedTour steps={steps} label="How to play" finishLabel="Back to game" onOpen={onOpen}
    autoOpen={params.get('tour') === '1'} onAutoOpen={() => {
      const next = new URLSearchParams(params); next.delete('tour');
      setParams(next, { replace: true });
    }} />;
}
