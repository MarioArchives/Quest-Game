import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSession } from '../session/SessionProvider';

/** GM-only routes bounce everyone else back home. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useSession();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}
