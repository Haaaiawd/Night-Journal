import { Routes, Route } from 'react-router'
import Layout from './components/Layout'
import Home from './pages/Home'
import Diary from './pages/Diary'
import DiaryDetail from './pages/DiaryDetail'
import CalendarPage from './pages/CalendarPage'
import Settings from './pages/Settings'
import Login from "./pages/Login"
import Register from "./pages/Register"
import NotFound from "./pages/NotFound"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="diary" element={<Diary />} />
        <Route path="diary/:date" element={<DiaryDetail />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
