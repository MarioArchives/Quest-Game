import './styles/base.css';
// The active pack's look: its theme.css overrides the engine tokens, so it must come after the base CSS.
import '@pack';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initBackend } from './backend';
import { Gate } from './Gate';
import { SessionProvider } from './session/SessionProvider';

// The backend is chosen at build time and set up before anything renders, so hooks can call backend() freely.
initBackend().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </StrictMode>,
  );
});
