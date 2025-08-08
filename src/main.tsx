import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'  // Assumendo che il CSS principale si chiami style.css dentro styles/
import App from './App'       // Import senza estensione

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
