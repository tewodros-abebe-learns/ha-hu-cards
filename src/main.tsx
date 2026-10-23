import { safeToUpdate, subscribeOperations } from './operationSafety';
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

let updateWaiting = false;
const offerUpdate = () => {
  if (!updateWaiting || !safeToUpdate()) return;
  updateWaiting = false;
  if (confirm('An app update is ready. Reload now?')) void updateSW(true).catch(error => console.warn('Could not activate app update:', error));
};
subscribeOperations(() => { if (updateWaiting) setTimeout(offerUpdate, 0); });
const updateSW = registerSW({
  onNeedRefresh() { updateWaiting = true; setTimeout(offerUpdate, 0); },
  onRegisterError(error) {
    console.warn('Offline support could not be initialized:', error);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

