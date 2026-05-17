import { Buffer } from 'buffer'
globalThis.Buffer = Buffer

import _sodium from 'libsodium-wrappers-sumo'
await _sodium.ready

import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
