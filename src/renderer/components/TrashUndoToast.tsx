import React, { useEffect, useRef, useState } from 'react';
import './TrashUndoToast.css';
import CloseIcon from './CloseIcon';

type TrashUndoToastProps = {
  message: string;
  dismissLabel: string;
  undoLabel: string;
  undoingLabel: string;
  onUndo: () => Promise<void>;
  onDismiss: () => void;
  durationMs?: number;
};

export default function TrashUndoToast({
  message,
  dismissLabel,
  undoLabel,
  undoingLabel,
  onUndo,
  onDismiss,
  durationMs = 5000,
}: TrashUndoToastProps) {
  const dismissRef = useRef(onDismiss);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (undoing || error) return undefined;

    const timer = window.setTimeout(() => dismissRef.current(), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, error, undoing]);

  const undo = async () => {
    if (undoing) return;
    setUndoing(true);
    setError('');
    try {
      await onUndo();
      onDismiss();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setUndoing(false);
    }
  };

  return (
    <div className="trash-undo-toast" role="status" aria-live="polite">
      <span>{error || message}</span>
      {!error && (
        <button disabled={undoing} onClick={undo} type="button">
          {undoing ? undoingLabel : undoLabel}
        </button>
      )}
      <button
        aria-label={dismissLabel}
        className="btn-plain trash-undo-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  );
}
