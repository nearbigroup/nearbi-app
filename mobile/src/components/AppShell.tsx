import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar } from 'react-native'
import { useAuth } from '../AuthContext'
import { BRANCHES } from '../data'

type Screen = 'dashboard' | 'attendance' | 'staff' | 'leave' | 'salary'

const ALL_NAV: { key: Screen; label: string; icon: string; hrAllowed: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '📊', hrAllowed: true },
  { key: 'attendance', label: 'Attendance', icon: '🕐', hrAllowed: true },
  { key: 'staff', label: 'Staff', icon: '👥', hrAllowed: true },
  { key: 'leave', label: 'Leave', icon: '📋', hrAllowed: true },
  { key: 'salary', label: 'Salary', icon: '💰', hrAllowed: false },
]

interface Props {
  children: React.ReactNode
  currentScreen: Screen
  onNavigate: (screen: Screen) => void
  onLogout: () => void
}

export default function AppShell({ children, currentScreen, onNavigate, onLogout }: Props) {
  const { user, branch } = useAuth()
  const isHR = user?.role === 'hr_manager'
  const NAV = ALL_NAV.filter(n => !isHR || n.hrAllowed)
  const branchLabel = BRANCHES.find(b => b.id === branch)?.name || 'Branch'

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#111111" />

      {/* Top bar */}
      <View style={s.topBar}>
        <View style={s.logoRow}>
          <Text style={s.logoNear}>near</Text>
          <Text style={s.logoBi}>bi</Text>
          <View style={s.staffBadge}>
            <Text style={s.staffBadgeText}>STAFF</Text>
          </View>
        </View>
        <View style={s.topRight}>
          {isHR && (
            <View style={s.hrBadge}>
              <Text style={s.hrBadgeText}>HR</Text>
            </View>
          )}
          {!isHR && <Text style={s.branchLabel}>{branchLabel}</Text>}
          <TouchableOpacity style={s.signOutBtn} onPress={onLogout}>
            <Text style={s.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      <View style={s.content}>
        {children}
      </View>

      {/* Bottom nav */}
      <View style={s.bottomNav}>
        {NAV.map(n => {
          const active = currentScreen === n.key
          return (
            <TouchableOpacity
              key={n.key}
              style={[s.navItem, active && s.navItemActive]}
              onPress={() => onNavigate(n.key)}
              activeOpacity={0.7}
            >
              <Text style={s.navIcon}>{n.icon}</Text>
              <Text style={[s.navLabel, active && s.navLabelActive]}>{n.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFA' },
  topBar: { backgroundColor: '#111111', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logoNear: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
  logoBi: { fontSize: 22, fontWeight: '900', color: '#F5A800', letterSpacing: -1 },
  staffBadge: { backgroundColor: '#F5A800', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 4 },
  staffBadgeText: { fontSize: 11, fontWeight: '700', color: '#111' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hrBadge: { backgroundColor: '#2ECC71', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  hrBadgeText: { fontSize: 11, fontWeight: '800', color: '#111' },
  branchLabel: { fontSize: 11, color: '#F5A800', fontWeight: '600' },
  signOutBtn: { borderWidth: 1, borderColor: '#444', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  signOutText: { color: '#AAA', fontSize: 12 },
  content: { flex: 1 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 2, borderTopColor: '#F5A800' },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderTopWidth: 3, borderTopColor: 'transparent' },
  navItemActive: { backgroundColor: '#FFF8E7', borderTopColor: '#F5A800' },
  navIcon: { fontSize: 20 },
  navLabel: { fontSize: 10, fontWeight: '500', color: '#757575', marginTop: 2 },
  navLabelActive: { fontWeight: '700', color: '#D48F00' },
})
