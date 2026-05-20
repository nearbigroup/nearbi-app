import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput
} from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { SAMPLE_STAFF, SHIFTS } from '../data'
import { calculateSalary, calculateOTMinutes } from '../salary'

export default function SalaryScreen() {
  const [selectedStaffId, setSelectedStaffId] = useState(SAMPLE_STAFF[0].id)
  const [leaveDays, setLeaveDays] = useState(0)
  const [otEntries, setOtEntries] = useState<{ date: string; outTime: string }[]>([])
  const [newOtOut, setNewOtOut] = useState('')

  const staff = SAMPLE_STAFF.find(s => s.id === selectedStaffId)!
  const shift = SHIFTS.find(s => s.id === staff.shiftId)!

  const totalOTMinutes = otEntries.reduce((sum, e) => {
    return sum + calculateOTMinutes(shift.end, e.outTime)
  }, 0)

  const result = calculateSalary(
    { monthlySalary: staff.monthlySalary, offDaysPerMonth: staff.offDaysPerMonth, shiftHours: shift.hours },
    { presentDays: 0, leaveDays, otMinutes: totalOTMinutes }
  )

  const addOT = () => {
    if (!newOtOut) return
    setOtEntries(prev => [...prev, { date: new Date().toISOString().split('T')[0], outTime: newOtOut }])
    setNewOtOut('')
  }

  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>Salary calculator</Text>
      <Text style={s.month}>{month}</Text>

      {/* Staff picker */}
      <View style={s.pickerWrap}>
        <Text style={s.fieldLabel}>Select staff</Text>
        <View style={s.pickerBox}>
          <Picker
            selectedValue={selectedStaffId}
            onValueChange={(v) => { setSelectedStaffId(v); setLeaveDays(0); setOtEntries([]) }}
            style={s.picker}
          >
            {SAMPLE_STAFF.map(st => (
              <Picker.Item key={st.id} label={`${st.name} — ${st.branch === 'daily' ? 'Daily' : 'Hypermarket'}`} value={st.id} />
            ))}
          </Picker>
        </View>
      </View>

      {/* Staff info card */}
      <View style={s.infoCard}>
        <View style={s.infoAvatar}>
          <Text style={s.infoAvatarText}>{staff.name.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.infoName}>{staff.name}</Text>
          <Text style={s.infoSub}>{staff.department} · {shift.label}</Text>
        </View>
        <View style={s.infoRight}>
          <Text style={s.infoSalary}>₹{staff.monthlySalary.toLocaleString()}</Text>
          <Text style={s.infoOff}>{staff.offDaysPerMonth} days off/mo</Text>
        </View>
      </View>

      {/* Inputs */}
      <View style={s.inputCard}>
        <Text style={s.inputCardTitle}>This month's data</Text>

        {/* Leave days */}
        <View style={s.inputRow}>
          <Text style={s.fieldLabel}>Extra leave days taken</Text>
          <View style={s.counter}>
            <TouchableOpacity style={s.counterBtn} onPress={() => setLeaveDays(Math.max(0, leaveDays - 1))}>
              <Text style={s.counterBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.counterVal}>{leaveDays}</Text>
            <TouchableOpacity style={s.counterBtn} onPress={() => setLeaveDays(leaveDays + 1)}>
              <Text style={s.counterBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={s.counterLabel}>day{leaveDays !== 1 ? 's' : ''} extra</Text>
          </View>
        </View>

        {/* OT */}
        <View style={{ marginTop: 14 }}>
          <Text style={s.fieldLabel}>OT days (shift end: {shift.end})</Text>
          <Text style={s.otNote}>OT counted only after 30 mins past shift end</Text>
          <View style={s.otRow}>
            <TextInput
              style={s.otInput}
              value={newOtOut}
              onChangeText={setNewOtOut}
              placeholder="e.g. 19:30"
              placeholderTextColor="#BDBDBD"
            />
            <TouchableOpacity style={s.otAddBtn} onPress={addOT}>
              <Text style={s.otAddText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {otEntries.map((e, i) => {
            const mins = calculateOTMinutes(shift.end, e.outTime)
            return (
              <View key={i} style={s.otEntry}>
                <Text style={s.otEntryOut}>Out: {e.outTime}</Text>
                <Text style={[s.otEntryVal, { color: mins > 0 ? '#2E7D32' : '#D32F2F' }]}>
                  {mins > 0 ? `+${(mins / 60).toFixed(2)}h OT` : 'No OT'}
                </Text>
              </View>
            )
          })}
        </View>
      </View>

      {/* Salary breakdown */}
      <View style={s.breakdown}>
        <Text style={s.breakdownTitle}>Salary breakdown</Text>
        <Row label="Base salary (30 days)" value={`₹${result.baseSalary.toLocaleString()}`} />
        <Row label="Working days entitled" value={`${result.workingDaysEntitled} days`} />
        <Row label="Daily rate" value={`₹${result.dailyRate}`} />
        <Row label="Hourly rate" value={`₹${result.hourlyRate}`} />
        <View style={s.divider} />
        <Row label={`Leave deduction (${leaveDays} day${leaveDays !== 1 ? 's' : ''})`} value={`−₹${result.leaveDeduction}`} valueColor="#FF6B6B" />
        <Row label={`OT pay (${result.otHours}h)`} value={`+₹${result.otPay}`} valueColor="#69D84F" />
        <View style={s.divider} />
        <View style={s.netRow}>
          <Text style={s.netLabel}>Net salary</Text>
          <Text style={s.netValue}>₹{result.netSalary.toLocaleString()}</Text>
        </View>
      </View>

      <TouchableOpacity style={s.payslipBtn}>
        <Text style={s.payslipText}>📄 Generate payslip</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={sr.row}>
      <Text style={sr.label}>{label}</Text>
      <Text style={[sr.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
    </View>
  )
}

const sr = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  label: { fontSize: 13, color: '#BDBDBD', flex: 1 },
  value: { fontSize: 13, fontWeight: '700', color: '#FFF' },
})

const s = StyleSheet.create({
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  month: { fontSize: 12, color: '#757575', marginBottom: 16 },
  pickerWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#444', marginBottom: 6 },
  pickerBox: { borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 10, backgroundColor: '#FFF', overflow: 'hidden' },
  picker: { height: 50 },
  infoCard: { backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  infoAvatar: { width: 44, height: 44, backgroundColor: '#F5A800', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoAvatarText: { fontWeight: '800', fontSize: 18, color: '#111' },
  infoName: { fontWeight: '700', fontSize: 15, color: '#FFF' },
  infoSub: { fontSize: 12, color: '#BDBDBD', marginTop: 2 },
  infoRight: { alignItems: 'flex-end' },
  infoSalary: { fontWeight: '800', fontSize: 18, color: '#F5A800' },
  infoOff: { fontSize: 11, color: '#757575', marginTop: 1 },
  inputCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 14, padding: 16, marginBottom: 16 },
  inputCardTitle: { fontWeight: '700', fontSize: 14, marginBottom: 14, color: '#111' },
  inputRow: {},
  counter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  counterBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { fontSize: 18, fontWeight: '700', color: '#111' },
  counterVal: { fontSize: 22, fontWeight: '800', minWidth: 32, textAlign: 'center', color: '#111' },
  counterLabel: { fontSize: 12, color: '#757575' },
  otNote: { fontSize: 11, color: '#757575', marginBottom: 8 },
  otRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  otInput: { flex: 1, borderWidth: 1.5, borderColor: '#E0E0E0', borderRadius: 8, padding: 8, fontSize: 13, color: '#111' },
  otAddBtn: { backgroundColor: '#F5A800', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' },
  otAddText: { fontWeight: '700', fontSize: 13, color: '#111' },
  otEntry: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  otEntryOut: { fontSize: 12, color: '#444' },
  otEntryVal: { fontSize: 12, fontWeight: '600' },
  breakdown: { backgroundColor: '#111', borderRadius: 16, padding: 20, marginBottom: 16 },
  breakdownTitle: { fontWeight: '700', fontSize: 15, color: '#FFF', marginBottom: 16 },
  divider: { borderTopWidth: 1, borderTopColor: '#333', marginVertical: 8 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  netValue: { fontSize: 24, fontWeight: '900', color: '#F5A800' },
  payslipBtn: { backgroundColor: '#F5A800', borderRadius: 10, padding: 14, alignItems: 'center' },
  payslipText: { fontWeight: '700', fontSize: 15, color: '#111' },
})
