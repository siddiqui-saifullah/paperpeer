import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/components.css';
import '../styles/responsive.css';
import { App } from './App';
import { ConfirmProvider } from './context/confirm';
import { SessionProvider } from './context/session';
import { ToastProvider } from './context/toast';
import { applySavedTheme } from './lib/theme';

applySavedTheme();

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  </StrictMode>,
);
