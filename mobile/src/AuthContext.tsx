import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type UserRole = 'admin' | 'ops_manager' | 'staff_executive' | 'hr_manager'

export interface AuthUser {
  email: string
  role: UserRole
  branch?: string
}

interface AuthContextType {
  user: AuthUser | null
  branch: string | null
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  setBranch: (branch: string) => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const VALID_USERS: Record<string, { password: string; role: UserRole }> = {
  'adminnearbi@gmail.com': { password: 'nearbi@123', role: 'admin' },
  'hrnearbi@gmail.com': { password: 'hr@123', role: 'hr_manager' },
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [branch, setBranchState] = useState<string | null>(null)

  useEffect(() => {
    AsyncStorage.getItem('nearbi_user').then(v => { if (v) setUser(JSON.parse(v)) })
    AsyncStorage.getItem('nearbi_branch').then(v => { if (v) setBranchState(v) })
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    const record = VALID_USERS[email.toLowerCase().trim()]
    if (record && record.password === password) {
      const u: AuthUser = { email, role: record.role }
      setUser(u)
      await AsyncStorage.setItem('nearbi_user', JSON.stringify(u))
      return true
    }
    return false
  }

  const logout = async () => {
    setUser(null)
    setBranchState(null)
    await AsyncStorage.removeItem('nearbi_user')
    await AsyncStorage.removeItem('nearbi_branch')
  }

  const setBranch = async (b: string) => {
    setBranchState(b)
    await AsyncStorage.setItem('nearbi_branch', b)
  }

  return (
    <AuthContext.Provider value={{ user, branch, login, logout, setBranch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
