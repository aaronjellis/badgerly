import React from 'react';

interface ErrorBoundaryProps {
  /** What to show in place of the children once one of them fails to load or render. */
  fallback: React.ReactNode;
  children: React.ReactNode;
}

/** Shows `fallback` when a child throws, such as the lazy 3D stage failing to load its chunk. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('A part of the page failed to load.', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
