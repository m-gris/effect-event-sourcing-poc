import { Routes, Route, Navigate } from 'react-router-dom'
import { DemoFunnel } from './pages/DemoFunnel'
import { Profile } from './pages/Profile'
import { Revert } from './pages/Revert'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/profile" replace />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/demo" element={<DemoFunnel />} />
      <Route path="/revert/:token" element={<Revert />} />
    </Routes>
  )
}

export default App
