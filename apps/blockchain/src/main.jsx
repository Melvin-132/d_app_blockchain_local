import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import '../../../src/shared/layout.css';
import './style.css';
import '../../../src/shared/theme.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
