// Mock data - replace with Supabase queries in production

export const BRANCHES = [
  { id: 'daily', name: 'Nearbi Daily' },
  { id: 'hypermarket', name: 'Nearbi Hypermarket' },
]

export const SHIFTS = [
  { id: 's1', label: '9:00 AM – 6:00 PM', start: '09:00', end: '18:00', hours: 9 },
  { id: 's2', label: '9:00 AM – 6:30 PM', start: '09:00', end: '18:30', hours: 9.5 },
  { id: 's3', label: '11:30 AM – 11:30 PM', start: '11:30', end: '23:30', hours: 12 },
  { id: 's4', label: '3:00 PM – 10:00 PM', start: '15:00', end: '22:00', hours: 7 },
  { id: 's5', label: '5:30 PM – 11:30 PM', start: '17:30', end: '23:30', hours: 6 },
]

export const DEPARTMENTS = [
  'Grocery', 'Fresh & Produce', 'Bakery', 'Cashier', 'Housekeeping', 'Receiving'
]

export interface Staff {
  id: string
  name: string
  pin: string
  branch: string
  department: string
  shiftId: string
  offDaysPerMonth: 0 | 2 | 4
  monthlySalary: number
  joinDate: string
  active: boolean
}

// Sample staff for demo
export const SAMPLE_STAFF: Staff[] = [
  { id: '1', name: 'Rajan K', pin: '1234', branch: 'daily', department: 'Grocery', shiftId: 's1', offDaysPerMonth: 4, monthlySalary: 12000, joinDate: '2024-01-15', active: true },
  { id: '2', name: 'Suresh M', pin: '2345', branch: 'daily', department: 'Fresh & Produce', shiftId: 's1', offDaysPerMonth: 4, monthlySalary: 11000, joinDate: '2024-03-01', active: true },
  { id: '3', name: 'Meenu A', pin: '3456', branch: 'daily', department: 'Cashier', shiftId: 's2', offDaysPerMonth: 2, monthlySalary: 10500, joinDate: '2023-11-10', active: true },
  { id: '4', name: 'Anitha P', pin: '4567', branch: 'daily', department: 'Housekeeping', shiftId: 's4', offDaysPerMonth: 0, monthlySalary: 9000, joinDate: '2024-06-01', active: true },
  { id: '5', name: 'Pradeep R', pin: '5678', branch: 'hypermarket', department: 'Grocery', shiftId: 's1', offDaysPerMonth: 4, monthlySalary: 13000, joinDate: '2023-08-20', active: true },
  { id: '6', name: 'Divya S', pin: '6789', branch: 'hypermarket', department: 'Cashier', shiftId: 's3', offDaysPerMonth: 2, monthlySalary: 11500, joinDate: '2024-02-14', active: true },
  { id: '7', name: 'Bijo T', pin: '7890', branch: 'hypermarket', department: 'Receiving', shiftId: 's1', offDaysPerMonth: 4, monthlySalary: 12500, joinDate: '2023-12-01', active: true },
]

export interface AttendanceRecord {
  id: string
  staffId: string
  date: string
  checkInTime: string | null
  checkOutTime: string | null
  status: 'present' | 'late' | 'absent'
  otMinutes: number
  markedBy: 'kiosk' | 'supervisor'
}

export interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  branch: string
  date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
}

// Today's sample attendance
export const TODAY = new Date().toISOString().split('T')[0]

export const SAMPLE_ATTENDANCE: AttendanceRecord[] = [
  { id: 'a1', staffId: '1', date: TODAY, checkInTime: '09:35', checkOutTime: null, status: 'late', otMinutes: 0, markedBy: 'kiosk' },
  { id: 'a2', staffId: '2', date: TODAY, checkInTime: '09:20', checkOutTime: null, status: 'late', otMinutes: 0, markedBy: 'kiosk' },
  { id: 'a3', staffId: '3', date: TODAY, checkInTime: '09:02', checkOutTime: null, status: 'present', otMinutes: 0, markedBy: 'kiosk' },
  { id: 'a4', staffId: '4', date: TODAY, checkInTime: null, checkOutTime: null, status: 'absent', otMinutes: 0, markedBy: 'supervisor' },
  { id: 'a5', staffId: '5', date: TODAY, checkInTime: '08:58', checkOutTime: null, status: 'present', otMinutes: 0, markedBy: 'kiosk' },
  { id: 'a6', staffId: '6', date: TODAY, checkInTime: '11:28', checkOutTime: null, status: 'present', otMinutes: 0, markedBy: 'kiosk' },
  { id: 'a7', staffId: '7', date: TODAY, checkInTime: '09:05', checkOutTime: null, status: 'present', otMinutes: 0, markedBy: 'kiosk' },
]

export const SAMPLE_LEAVES: LeaveRequest[] = [
  { id: 'l1', staffId: '4', staffName: 'Anitha P', branch: 'daily', date: new Date(Date.now() + 86400000).toISOString().split('T')[0], reason: 'Family function', status: 'pending', requestedAt: new Date().toISOString() },
  { id: 'l2', staffId: '2', staffName: 'Suresh M', branch: 'daily', date: new Date(Date.now() + 172800000).toISOString().split('T')[0], reason: 'Medical', status: 'pending', requestedAt: new Date().toISOString() },
]
