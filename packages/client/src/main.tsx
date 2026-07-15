/**
 * React 入口。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('缺少 #root 挂载点');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
