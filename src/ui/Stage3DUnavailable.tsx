import React from 'react';

/** What the stage area shows when the 3D stage cannot load: the view toggle, so 2D is one click away, and a note. */
export const Stage3DUnavailable: React.FC<{ viewToggle: React.ReactNode }> = ({ viewToggle }) => (
  <div className="stage viewport-2d-wrapper stage3d">
    <div className="viewport-2d-hud">
      <div className="hud-scroll">
        <div className="hud-toggles" role="group" aria-label="Stage view">
          {viewToggle}
        </div>
      </div>
    </div>
    <p className="stage3d-note" role="alert">
      This browser can’t show 3D. Switch to 2D to keep editing.
    </p>
  </div>
);
