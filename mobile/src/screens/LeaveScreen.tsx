import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet
} from 'react-native'
import { SAMPLE_LEAVES, SAMPLE_STAFF, LeaveRequest } from '../data'

type Tab = 'pending' | 'approved' | 'rejected'

export default function LeaveScreen() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>(SAMPLE_LEAVES)
  const [tab, setTab] = useState<Tab>('pending')

  const filtered = leaves.filter(l => l.status === tab)
  const pending = leaves.filter(l => l.status === 'pending').length

  const approve = (id: string) => setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'approved' as const } : l))
  const reject = (id: string) => setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' as const } : l))

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pending', label: `Pending${pending > 0 ? ` (${pending})` : ''}` },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Leave requests</Text>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, tab === t.key && s.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <View style={s.list}>
        {filtered.map(l => {
          const staff = SAMPLE_STAFF.find(s => s.id === l.staffId)
          const leaveDate = new Date(l.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
          const borderColor = tab === 'pending' ? '#F5A800' : tab === 'approved' ? '#2E7D32' : '#D32F2F'
          return (
            <View key={l.id} style={[s.card, { borderLeftColor: borderColor }]}>
              <View style={s.cardTop}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>{l.staffName.charAt(0)}</Text>
                </View>
                <View style={s.info}>
                  <Text style={s.staffName}>{l.staffName}</Text>
                  <Text style={s.staffSub}>{staff?.department} · {l.branch === 'daily' ? 'Nearbi Daily' : 'Hypermarket'}</Text>
                  <Text style={s.leaveDate}><Text style={{ fontWeight: '600' }}>Date: </Text>{leaveDate}</Text>
                  <Text style={s.reason}><Text style={{ fontWeight: '600' }}>Reason: </Text>{l.reason}</Text>
                </View>
              </View>

              {tab === 'pending' && (
                <View style={s.actions}>
                  <TouchableOpacity style={s.rejectBtn} onPress={() => reject(l.id)}>
                    <Text style={s.rejectText}>✕ Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.approveBtn} onPress={() => approve(l.id)}>
                    <Text style={s.approveText}>✓ Approve</Text>
                  </TouchableOpacity>
                </View>
              )}

              {tab !== 'pending' && (
                <Text style={[s.statusLabel, { color: tab === 'approved' ? '#2E7D32' : '#D32F2F' }]}>
                  {tab === 'approved' ? '✓ Approved' : '✕ Rejected'}
                </Text>
              )}
            </View>
          )
        })}
        {filtered.length === 0 && (
          <Text style={s.empty}>No {tab} requests</Text>
        )}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 16 },
  tabs: { flexDirection: 'row', backgroundColor: '#F5F5F5', borderRadius: 10, padding: 3, marginBottom: 20 },
  tab: { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 8 },
  tabActive: { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontSize: 13, fontWeight: '500', color: '#757575' },
  tabTextActive: { fontWeight: '700', color: '#111' },
  list: { gap: 10 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 14, padding: 16, borderLeftWidth: 4 },
  cardTop: { flexDirection: 'row', gap: 12 },
  avatar: { width: 40, height: 40, backgroundColor: '#F5A800', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '800', fontSize: 16, color: '#111' },
  info: { flex: 1 },
  staffName: { fontWeight: '700', fontSize: 14, color: '#111' },
  staffSub: { fontSize: 11, color: '#757575', marginTop: 2 },
  leaveDate: { fontSize: 13, color: '#111', marginTop: 8 },
  reason: { fontSize: 13, color: '#444', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  rejectBtn: { flex: 1, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#EF9A9A', borderRadius: 8, padding: 10, alignItems: 'center' },
  rejectText: { fontWeight: '700', fontSize: 13, color: '#D32F2F' },
  approveBtn: { flex: 1, backgroundColor: '#F5A800', borderRadius: 8, padding: 10, alignItems: 'center' },
  approveText: { fontWeight: '700', fontSize: 13, color: '#111' },
  statusLabel: { marginTop: 10, fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', padding: 40, color: '#BDBDBD', fontSize: 14 },
})
