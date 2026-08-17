import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { migrateStorage } from './utils/migrateStorage';
import { migrateDatabase } from './utils/migrateDatabase';
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

// Rename stored keys before any component reads them. The database copy is
// async and safe to run alongside: reads of the new database simply find it
// empty until the copy lands.
migrateStorage();
void migrateDatabase();

// Runs after the rename, so it reads the list under its current key.
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
