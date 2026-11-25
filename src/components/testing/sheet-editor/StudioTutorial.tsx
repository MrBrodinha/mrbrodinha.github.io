import { useMemo } from 'react';
import { useAuth } from '../../../auth/authContext';
import GuidedTour from '../../brodle/components/GuidedTour';
import { studioTutorialSteps } from '../../brodle/lib/studioTutorial';

export default function StudioTutorial({ gameMelody, readOnly, onOpen }: {
  gameMelody: boolean; readOnly: boolean; onOpen: () => void;
}) {
  const { user } = useAuth();
  const steps = useMemo(() => studioTutorialSteps({ signedIn: Boolean(user), gameMelody, readOnly }), [user, gameMelody, readOnly]);
  return <GuidedTour steps={steps} label="How to compose" finishLabel="Back to composing" onOpen={onOpen} scope=".sheet-editor-page" />;
}
