import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';
import './styles/tokens.css';
import './ui-fixes.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
