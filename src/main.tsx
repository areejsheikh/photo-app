import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';
import '@aws-amplify/ui-react/styles.css';
import './index.css';
import App from './App';

type RestConfig = Record<string, { endpoint: string; region?: string }>;

Amplify.configure(outputs);

// Register the REST API (API Gateway) that backend.ts adds under "custom"
const rest =
  (outputs as unknown as { custom?: { API?: RestConfig } }).custom?.API ?? {};
const existing = Amplify.getConfig();
Amplify.configure({ ...existing, API: { ...existing.API, REST: rest } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
