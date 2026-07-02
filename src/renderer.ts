import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './renderer/App';
import './renderer/styles/tokens.css';
import './renderer/styles/workspace.css';

const container = document.getElementById('app')!;
const root = createRoot(container);
root.render(React.createElement(App));
