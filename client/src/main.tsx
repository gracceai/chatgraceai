import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Admin from './Admin';
import App from './App';
import './index.css';

const Page = window.location.pathname.startsWith('/admin') ? Admin : App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
