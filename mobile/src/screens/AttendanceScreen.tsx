import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet
} from 'react-native'
import { SAMPLE_STAFF, SAMPLE_ATTENDANCE, SHIFTS, TODAY } from '../data'

type StatusKey = 'present' | 'late' | 'absent'
type FilterKey = 'all' | StatusKey
type BranchFilter = 'all' | 'daily' | 'hypermarket'

const STATUS_CONFIG = {
  present: { color: '#1B7F3A', bg: '#E6F4EA', border: '#A8D5B5', label: 'Present', dot: '#2ECC71' },
  late:    { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D', label: 'Late',    dot: '#F59E0B' },
  absent:  { color: '#BE123C', bg: '#FFF1F2', border: '#FECDD3', label: 'Absent',  dot: '#F43F5E' },
}

export default function AttendanceScreen() {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('all')

  const todayStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  const staffWithAtt = SAMPLE_STAFF.map(s => {
    const att = SAMPLE_ATTENDANCE.find(a => a.staffId === s.id && a.date === TODAY)
    const shift = SHIFTS.find(sh => sh.id === s.shiftId)
    return { ...s, attendance: att, shift }
  }).filter(s => branchFilter === 'all' || s.branch === branchFilter)
    .filter(s => filter === 'all' || (s.attendance?.status === filter) || (filter === 'absent' && !s.attendance))

  const counts = {
    all: SAMPLE_STAFF.length,
    present: SAMPLE_ATTENDANCE.filter(a => a.status === 'present' && a.date === TODAY).length,
    late:    SAMPLE_ATTENDANCE.filter(a => a.status === 'late'    && a.date === TODAY).length,
    absent:  SAMPLE_ATTENDANCE.filter(a => a.status === 'absent'  && a.date === TODAY).length,
  }

  const FILTERS: { key: FilterKey; label: string; count: number; color: string }[] = [
    { key: 'all',     label: 'All',     count: counts.all,     color: '#111' },
    { key: 'present', label: 'Present', count: counts.present, color: '#1B7F3A' },
    { key: 'late',    label: 'Late',    count: counts.late,    color: '#B45309' },
    { key: 'absent',  label: 'Absent',  count: counts.absent,  color: '#BE123C' },
  ]

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Attendance</Text>
        <Text style={s.date}>{todayStr}</Text>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {[
          { label: 'Present', count: counts.present, color: '#1B7F3A', bg: '#E6F4EA' },
          { label: 'Late',    count: counts.late,    color: '#B45309', bg: '#FEF3C7' },
          { label: 'Absent',  count: counts.absent,  color: '#BE123C', bg: '#FFF1F2' },
        ].map(item => (
          <View key={item.label} style={[s.statBox, { backgroundColor: item.bg }]}>
            <Text style={[s.statValue, { color: item.color }]}>{item.count}</Text>
            <Text style={[s.statLabel, { color: item.color }]}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillRow} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
        {FILTERS.map(f => {
          const active = filter === f.key
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.pill, active && { backgroundColor: f.color }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.pillText, active && { color: '#FFF' }]}>
                {f.label} <Text style={{ opacity: 0.8 }}>{f.count}</Text>
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Branch toggle */}
      <View style={s.branchToggle}>
        {([['all', 'All'], ['daily', 'Nearbi Daily'], ['hypermarket', 'Hypermarket']] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[s.branchBtn, branchFilter === key && s.branchBtnActive]}
            onPress={() => setBranchFilter(key)}
          >
            <Text style={[s.branchBtnText, branchFilter === key && s.branchBtnTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Staff list */}
      <View style={s.list}>
        {staffWithAtt.map(s2 => {
          const status = (s2.attendance?.status || 'absent') as StatusKey
          const sc = STATUS_CONFIG[status]
          const initials = s2.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
          return (
            <View key={s2.id} style={[s.staffCard, { borderLeftColor: sc.dot }]}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{initials}</Text>
              </View>
              <View style={s.staffInfo}>
                <Text style={s.staffName}>{s2.name}</Text>
                <Text style={s.staffSub}>{s2.department} · {s2.shift?.label}</Text>
                {s2.attendance?.checkInTime && (
                  <Text style={s.checkIn}>Check-in {s2.attendance.checkInTime}</Text>
                )}
              </View>
              <View style={s.statusCol}>
                <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                  <Text style={[s.statusText, { color: sc.color }]}>{sc.label}</Text>
                </View>
                <Text style={s.branchTag}>{s2.branch === 'daily' ? 'Daily' : 'HM'}</Text>
              </View>
            </View>
          )
        })}
        {staffWithAtt.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🔍</Text>
            <Text style={s.emptyTitle}>No staff found</Text>
            <Text style={s.emptySub}>Try changing the filter</Text>
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#111', letterSpacing: -0.5 },
  date: { fontSize: 13, color: '#888', marginTop: 3, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statBox: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  statLabel: { fontSize: 11, fontWeight: '700', marginTop: 4, opacity: 0.8 },
  pillRow: { marginBottom: 12 },
  pill: { backgroundColor: '#F0F0F0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, flexShrink: 0 },
  pillText: { fontSize: 13, fontWeight: '700', color: '#666' },
  branchToggle: { flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 10, padding: 3, marginBottom: 20 },
  branchBtn: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 4 },
  branchBtnActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  branchBtnText: { fontSize: 12, fontWeight: '500', color: '#888' },
  branchBtnTextActive: { fontWeight: '700', color: '#111' },
  list: { gap: 10 },
  staffCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1, borderLeftWidth: 4 },
  avatar: { width: 44, height: 44, backgroundColor: '#F5A800', borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '900', fontSize: 16, color: '#111', letterSpacing: -0.5 },
  staffInfo: { flex: 1 },
  staffName: { fontWeight: '700', fontSize: 15, color: '#111' },
  staffSub: { fontSize: 12, color: '#888', marginTop: 2, fontWeight: '500' },
  checkIn: { fontSize: 12, color: '#555', marginTop: 3, fontWeight: '600' },
  statusCol: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  statusText: { fontSize: 12, fontWeight: '700' },
  branchTag: { fontSize: 10, color: '#BBB', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#444' },
  emptySub: { fontSize: 13, color: '#AAA', marginTop: 4 },
})
