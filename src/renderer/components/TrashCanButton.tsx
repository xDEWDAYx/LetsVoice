import React from 'react';
import './TrashCanButton.css';

type TrashCanButtonProps = {
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  disabled?: boolean;
};

/** Persistent delete affordance whose lid opens on hover or keyboard focus. */
export default function TrashCanButton({
  label,
  onClick,
  className = '',
  disabled = false,
}: TrashCanButtonProps) {
  return (
    <button
      aria-label={label}
      className={`btn-plain trash-can-button ${className}`.trim()}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
        viewBox="0 0 24 24"
        width="18"
      >
        <g className="trash-can-lid">
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
        </g>
        <path d="m7 9 1 11h8l1-11" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}
