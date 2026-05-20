import React from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet
} from 'react-native'
import { SAMPLE_STAFF, SAMPLE_ATTENDANCE, SAMPLE_LEAVES, TODAY } from '../data'

type Screen = 'dashboard' | 'attendance' | 'staff' | 'leave' | 'salary'

interface Props { onNavigate: (screen: Screen) => void }

const branches = [
  { id: 'daily', name: 'Nearbi Daily' },
  { id: 'hypermarket', name: 'Nearbi Hypermarket' },
]

function getBranchStats(branchId: string) {
  const staff = SAMPLE_STAFF.filter(s => s.branch === branchId)
  const att = SAMPLE_ATTENDANCE.filter(a => {
    const s = SAMPLE_STAFF.find(x => x.id === a.staffId)
    return s?.branch === branchId && a.date === TODAY
  })
  return {
    total: staff.length,
    present: att.filter(a => a.status === 'present').length,
    late: att.filter(a => a.status === 'late').length,
    absent: att.filter(a => a.status === 'absent').length,
  }
}

export default function DashboardScreen({ onNavigate }: Props) {
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const pendingLeaves = SAMPLE_LEAVES.filter(l => l.status === 'pending')
  const lateStaff = SAMPLE_ATTENDANCE
    .filter(a => a.status === 'late' && a.date === TODAY)
    .map(a => SAMPLE_STAFF.find(s => s.id === a.staffId)?.name)
    .filter(Boolean)

  const quickActions: { label: string; icon: string; screen: Screen }[] = [
    { label: 'View attendance', icon: '🕐', screen: 'attendance' },
    { label: 'Manage staff', icon: '👥', screen: 'staff' },
    { label: 'Leave requests', icon: '📋', screen: 'leave' },
    { label: 'Salary calc', icon: '💰', screen: 'salary' },
  ]

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.date}>{todayStr}</Text>
      <Text style={s.greeting}>Good morning 👋</Text>

      {/* Branch cards */}
      <Text style={s.sectionTitle}>Today's attendance</Text>
      {branches.map(b => {
        const stats = getBranchStats(b.id)
        return (
          <View key={b.id} style={s.branchCard}>
            <Text style={s.branchName}>{b.name}</Text>
            <View style={s.statsRow}>
              <StatBox label="Present" value={stats.present} color="#2E7D32" bg="#E8F5E9" />
              <StatBox label="Late" value={stats.late} color="#E65100" bg="#FFF3E0" />
              <StatBox label="Absent" value={stats.absent} color="#D32F2F" bg="#FFEBEE" />
              <StatBox label="Total" value={stats.total} color="#444" bg="#F5F5F5" />
            </View>
          </View>
        )
      })}

      {/* Alerts */}
      {lateStaff.length > 0 && (
        <View style={s.alertLate}>
          <Text style={s.alertTitle}>⏰ Late arrivals today</Text>
          <Text style={s.alertBody}>{lateStaff.join(', ')}</Text>
        </View>
      )}

      {pendingLeaves.length > 0 && (
        <TouchableOpacity style={s.alertLeave} onPress={() => onNavigate('leave')}>
          <Text style={s.alertLeaveTitle}>📋 {pendingLeaves.length} leave request{pendingLeaves.length > 1 ? 's' : ''} pending</Text>
          <Text style={s.alertLeaveSub}>Tap to review →</Text>
        </TouchableOpacity>
      )}

      {/* Quick actions */}
      <Text style={s.sectionTitle}>Quick actions</Text>
      <View style={s.actionsGrid}>
        {quickActions.map(a => (
          <TouchableOpacity key={a.screen} style={s.actionBtn} onPress={() => onNavigate(a.screen)} activeOpacity={0.8}>
            <Text style={s.actionIcon}>{a.icon}</Text>
            <Text style={s.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

function StatBox({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[s.statBox, { backgroundColor: bg }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={[s.statLabel, { color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  date: { fontSize: 12, color: '#757575', marginTop: 8 },
  greeting: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 20, marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  branchCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 14, padding: 16, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#F5A800' },
  branchName: { fontWeight: '700', fontSize: 14, marginBottom: 12, color: '#111' },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },
  alertLate: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: '#FFB74D', borderRadius: 12, padding: 14, marginBottom: 12 },
  alertTitle: { fontWeight: '700', fontSize: 13, color: '#E65100', marginBottom: 4 },
  alertBody: { fontSize: 13, color: '#BF360C' },
  alertLeave: { backgroundColor: '#FFF8E7', borderWidth: 1, borderColor: '#F5A800', borderRadius: 12, padding: 14, marginBottom: 24 },
  alertLeaveTitle: { fontWeight: '700', fontSize: 13, color: '#D48F00', marginBottom: 4 },
  alertLeaveSub: { fontSize: 12, color: '#757575' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionBtn: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 16, width: '47.5%', flexDirection: 'row', alignItems: 'center', gap: 10 },
  actionIcon: { fontSize: 22 },
  actionLabel: { fontSize: 13, fontWeight: '600', color: '#111', flex: 1 },
})
