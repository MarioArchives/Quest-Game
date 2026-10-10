import '@fontsource/anton/latin-400.css';
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/archivo/latin-700.css';
import '@fontsource/archivo/latin-800.css';
import './styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Gate } from './Gate';
import { SessionProvider } from './session/SessionProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <Gate />
    </SessionProvider>
  </StrictMode>,
);
