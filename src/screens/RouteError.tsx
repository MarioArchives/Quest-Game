import { useRouteError } from 'react-router';
import { Button } from '../components/Button';
import './RouteError.css';

/** Friendly last-resort screen when a route throws while rendering. */
export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  return (
    <div className="route-error" role="alert">
      <h1>Something went off-key</h1>
      <p>That screen hit a snag. Reloading usually sorts it, and your game progress is safe on the server.</p>
      <Button
        variant="primary"
        block
        onClick={() => {
          window.location.hash = '#/';
          window.location.reload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}
