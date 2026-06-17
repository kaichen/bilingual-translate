import './style.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('app')!).render(createElement(App));
