import React from 'react';

/**
 * The Badgerly mark: a badger face from the front, with an ink head, two white stripes from the
 * brow to the nose, and an accent nose. `public/icon.svg` holds the same drawing with literal colors.
 */
export const BadgerMark: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <circle cx="7.5" cy="8" r="3.2" fill="var(--ink)" />
    <circle cx="24.5" cy="8" r="3.2" fill="var(--ink)" />
    <path
      d="M5 13C5 6.5 10 4.5 16 4.5S27 6.5 27 13c0 4-1.8 7.5-3.2 10.6C22.6 27.2 19.8 29 16 29s-6.6-1.8-7.8-5.4C6.8 20.5 5 17 5 13Z"
      fill="var(--ink)"
    />
    <path d="M9.8 6.8C12 6 13.5 6.4 14.4 7.6L15.3 24.2C13.2 22.6 11.6 20 10.7 16.6C10 13.6 9.8 10 9.8 6.8Z" fill="var(--surface)" />
    <path d="M22.2 6.8C20 6 18.5 6.4 17.6 7.6L16.7 24.2C18.8 22.6 20.4 20 21.3 16.6C22 13.6 22.2 10 22.2 6.8Z" fill="var(--surface)" />
    <ellipse cx="16" cy="26" rx="3" ry="2.1" fill="var(--accent)" />
  </svg>
);
