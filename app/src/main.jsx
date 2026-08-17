import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { pruneUnopenableRecents } from './utils/pruneRecents';
import { initAppearance } from './store/appearanceStore';
import App from './App';
// Single stylesheet entry: theme.css pulls in Tailwind and then the legacy
// sheet into a lower cascade layer, so utilities always win over old rules.
import './styles/theme.css';

/* Left in for the machines that ran the progressive web app during development
   and still hold its worker. `public/sw.js` handles everyone else; this handles
   whoever is running the dev server on the same origin the PWA used. */
if (import.meta.env.DEV) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

/* Drops recent entries left over from before a recent file was remembered by
   path. They render a tile that cannot open anything.

   The two storage migrations that used to run here went with the browser: they
   copied data forward from the names this project shipped under before, and the
   application reads its storage at a different origin than the website ever
   did, so there is nothing at those old names to find. */
pruneUnopenableRecents();

// Paint the saved theme onto the root before React's first render, so the app
// never flashes the default accent on the way to the chosen one.
initAppearance();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
