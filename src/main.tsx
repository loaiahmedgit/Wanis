import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RenderHarness } from './components/RenderHarness'

// Hidden render route for the critique loop: ?rendergraph=<base64 scene graph>
// mounts just the real StrokePlayer in the real .scene-canvas card, so a
// screenshot matches exactly what a student sees. Dev-only — never active in
// a production build.
const renderGraph = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('rendergraph')
  : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {renderGraph ? <RenderHarness encoded={renderGraph} /> : <App />}
  </StrictMode>,
)
