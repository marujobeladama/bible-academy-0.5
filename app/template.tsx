import { ViewTransition } from 'react';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition name="route-content" enter="route-enter" exit="route-exit" default="none">
      {children}
    </ViewTransition>
  );
}