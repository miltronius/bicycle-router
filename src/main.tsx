import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './index.css';
import App from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

async function start() {
  // Dev/E2E only — statically eliminated from builds without VITE_MOCK=1
  if (import.meta.env.VITE_MOCK === '1') (await import('./mocks')).installMocks();
  createRoot(root!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
void start();
