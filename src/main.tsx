import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { RenderHarness, BoardRenderHarness } from './components/RenderHarness'

// Hidden render routes for the critique/verification loops (dev-only):
//   ?rendergraph=<base64 scene graph> — the real StrokePlayer in the real card.
//   ?renderboard=<base64 lessonBoard> — the real multi-section board + camera.
const params = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const renderGraph = params?.get('rendergraph') ?? null
const renderBoard = params?.get('renderboard') ?? null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {renderBoard ? <BoardRenderHarness encoded={renderBoard} /> : renderGraph ? <RenderHarness encoded={renderGraph} /> : <App />}
  </StrictMode>,
)
