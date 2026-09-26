import { useEffect, useState } from 'react';
import TranscriptionController, {
  TranscriptionControllerSnapshot,
} from './TranscriptionController';

export default function useTranscriptionController(
  controller: TranscriptionController,
): TranscriptionControllerSnapshot {
  const [state, setState] = useState(() => ({
    controller,
    snapshot: controller.getSnapshot(),
  }));

  useEffect(() => {
    const publish = () => {
      setState({ controller, snapshot: controller.getSnapshot() });
    };
    const unsubscribe = controller.subscribe(publish);
    // The controller can change without emitting. Publish once after subscribing
    // so an update between render and this effect cannot be missed.
    publish();
    return unsubscribe;
  }, [controller]);

  // Effects run after child rendering. Returning the new controller's snapshot
  // immediately prevents one frame of the previous completed transcript from
  // reopening the review dialog while save actions already target the new one.
  return state.controller === controller
    ? state.snapshot
    : controller.getSnapshot();
}
