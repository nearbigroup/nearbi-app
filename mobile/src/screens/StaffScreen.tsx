import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput
} from 'react-native'
import { SAMPLE_STAFF, SHIFTS, DEPARTMENTS } from '../data'
import { useAuth } from '../AuthContext'

export default function StaffScreen() {
  const { user } = useAuth()
  const isHR = user?.role === 'hr_manager'
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const filtered = SAMPLE_STAFF.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.department.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>Staff</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => setShowAdd(!showAdd)}>
          <Text style={s.addBtnText}>+ Add staff</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <TextInput
        style={s.search}
        placeholder="Search by name or department..."
        placeholderTextColor="#BDBDBD"
        value={search}
        onChangeText={setSearch}
      />

      {/* Add form placeholder */}
      {showAdd && (
        <View style={s.addForm}>
          <Text style={s.addFormTitle}>New staff member</Text>
          <Text style={s.addFormNote}>Full add form available in web portal</Text>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAdd(false)}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Count */}
      <Text style={s.count}>{filtered.length} staff members</Text>

      {/* Staff list */}
      <View style={s.list}>
        {filtered.map(member => {
          const shift = SHIFTS.find(sh => sh.id === member.shiftId)
          return (
            <View key={member.id} style={s.card}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{member.name.charAt(0)}</Text>
              </View>
              <View style={s.info}>
                <Text style={s.name}>{member.name}</Text>
                <Text style={s.sub}>{member.department} · {member.branch === 'daily' ? 'Nearbi Daily' : 'Hypermarket'}</Text>
                <Text style={s.sub}>{shift?.label} · PIN: {member.pin}</Text>
              </View>
              <View style={s.right}>
                {!isHR && <Text style={s.salary}>₹{member.monthlySalary.toLocaleString()}</Text>}
                <Text style={s.offDays}>{member.offDaysPerMonth} days off</Text>
              </View>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#111' },
  addBtn: { backgroundColor: '#F5A800', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#111' },
  search: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 14, color: '#111', marginBottom: 14, backgroundColor: '#FFF' },
  addForm: { backgroundColor: '#FFF8E7', borderWidth: 2, borderColor: '#F5A800', borderRadius: 14, padding: 18, marginBottom: 16 },
  addFormTitle: { fontWeight: '700', fontSize: 15, marginBottom: 8, color: '#111' },
  addFormNote: { fontSize: 13, color: '#757575', marginBottom: 12 },
  cancelBtn: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, alignItems: 'center' },
  cancelBtnText: { fontWeight: '600', color: '#444', fontSize: 13 },
  count: { fontSize: 12, color: '#757575', marginBottom: 8 },
  list: { gap: 8 },
  card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, backgroundColor: '#111', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontWeight: '800', fontSize: 18, color: '#F5A800' },
  info: { flex: 1 },
  name: { fontWeight: '700', fontSize: 14, color: '#111' },
  sub: { fontSize: 11, color: '#757575', marginTop: 1 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  salary: { fontSize: 13, fontWeight: '700', color: '#111' },
  offDays: { fontSize: 10, color: '#BDBDBD', marginTop: 2 },
})
