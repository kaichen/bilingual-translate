import './style.css';
import { h, render } from 'preact';
import App from './App';

render(h(App, {}), document.getElementById('app')!);
