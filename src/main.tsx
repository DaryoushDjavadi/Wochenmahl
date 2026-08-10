import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { startHouseholdSync } from './sync/householdSync'
import './styles.css'

void startHouseholdSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
