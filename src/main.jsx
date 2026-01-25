import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    {/* <div style={{ color: 'red', fontSize: '24px', padding: '20px' }}>TEST - SI VES ESTO, EL ENTORNO FUNCIONA</div> */}
  </StrictMode>,
)
