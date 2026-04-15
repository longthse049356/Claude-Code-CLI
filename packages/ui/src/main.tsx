import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './App.css'

// Set dark mode on initial page load
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
 document.documentElement.classList.add('dark');
} else if (savedTheme === 'light') {
 document.documentElement.classList.remove('dark');
} else {
 // Default to dark mode
 document.documentElement.classList.add('dark');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
 <React.StrictMode>
 <App />
 </React.StrictMode>,
)
