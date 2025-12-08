import { Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { DemoFunnel } from './pages/DemoFunnel'
import { Profile } from './pages/Profile'
import { Revert } from './pages/Revert'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/users/:nickname" element={<Profile />} />
      <Route path="/demo" element={<DemoFunnel />} />
      <Route path="/revert/:token" element={<Revert />} />
    </Routes>
  )
}

export default App
