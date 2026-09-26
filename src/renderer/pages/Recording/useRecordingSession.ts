import { useEffect, useState } from 'react';
import { RecordingSession } from './RecordingSession';
import { RecordingSnapshot } from './RecordingTypes';

/** 订阅普通 RecordingSession 类，使 React 在录音状态变化时重新渲染。 */
export default function useRecordingSession(
  session: RecordingSession,
): RecordingSnapshot {
  const [state, setState] = useState(() => ({
    session,
    snapshot: session.getSnapshot(),
  }));

  useEffect(() => {
    const publish = () => {
      setState({ session, snapshot: session.getSnapshot() });
    };
    const unsubscribe = session.subscribe(publish);
    publish();
    return unsubscribe;
  }, [session]);

  return state.session === session ? state.snapshot : session.getSnapshot();
}
