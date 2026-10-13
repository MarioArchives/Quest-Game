import look from '@pack';
import { useRouteError } from 'react-router';
import { Button } from '../components/Button';
import './RouteError.css';

const DEFAULT_COPY = {
  title: 'Something went off-key',
  body: 'That screen hit a snag. Reloading usually sorts it, and your game progress is safe on the server.',
  home: 'Back home',
};

/**
 * Friendly last-resort screen when a route throws while rendering or a lazy chunk fails to load. It renders
 * outside the app frame, so it uses no live data and no lazy code; the pack can reword it (and restyle it).
 */
export function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);
  const copy = { ...DEFAULT_COPY, ...look.error };
  return (
    <div className="route-error" role="alert">
      <div className="route-error__tape" aria-hidden="true" />
      <div className="route-error__card">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
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
        <a className="btn btn--ghost btn--block route-error__home" href="#/">
          {copy.home}
        </a>
      </div>
    </div>
  );
}
