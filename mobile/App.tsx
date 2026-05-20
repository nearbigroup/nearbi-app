import React, { useState } from 'react'
import { AuthProvider, useAuth } from './src/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import AppShell from './src/components/AppShell'
import DashboardScreen from './src/screens/DashboardScreen'
import AttendanceScreen from './src/screens/AttendanceScreen'
import StaffScreen from './src/screens/StaffScreen'
import LeaveScreen from './src/screens/LeaveScreen'
import SalaryScreen from './src/screens/SalaryScreen'

type Screen = 'dashboard' | 'attendance' | 'staff' | 'leave' | 'salary'

function Main() {
  const { user, logout } = useAuth()
  const [screen, setScreen] = useState<Screen>('dashboard')

  if (!user) {
    return <LoginScreen onLogin={() => setScreen('dashboard')} />
  }

  const handleNavigate = (s: Screen) => setScreen(s)

  const handleLogout = () => {
    logout()
  }

  const renderScreen = () => {
    switch (screen) {
      case 'dashboard':   return <DashboardScreen onNavigate={handleNavigate} />
      case 'attendance':  return <AttendanceScreen />
      case 'staff':       return <StaffScreen />
      case 'leave':       return <LeaveScreen />
      case 'salary':      return <SalaryScreen />
      default:            return <DashboardScreen onNavigate={handleNavigate} />
    }
  }

  return (
    <AppShell currentScreen={screen} onNavigate={handleNavigate} onLogout={handleLogout}>
      {renderScreen()}
    </AppShell>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  )
}
