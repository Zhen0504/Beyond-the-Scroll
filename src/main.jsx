import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/ma-shan-zheng/400.css';
import '@fontsource/noto-serif-sc/400.css';
import '@fontsource/noto-serif-sc/600.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/buttons.css';

import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
