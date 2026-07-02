'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Staff, SalaryConfirmation, SalaryPayment } from './types';
import { formatCurrency, getPastMonths, formatMonthDisplay } from './utils';
import { Download } from 'lucide-react';
import { calculateSalary, calculateLateSalaryDeduction } from '@/lib/salary';
import XLSX from 'xlsx-js-style';

export default function MonthlyReportTab({
  selectedMonth: propMonth,
  onGoToBulkConfirm
}: {
  selectedMonth?: string;
  onGoToBulkConfirm?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  
  const months = getPastMonths(6);
  const [selectedMonthState, setSelectedMonthState] = useState(propMonth || months[0]);
  const selectedMonth = propMonth || selectedMonthState;

  useEffect(() => {
    if (propMonth) {
      setSelectedMonthState(propMonth);
    }
  }, [propMonth]);

  const setSelectedMonth = (m: string) => {
    setSelectedMonthState(m);
  };
  
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [confirmations, setConfirmations] = useState<SalaryConfirmation[]>([]);
  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [lateFines, setLateFines] = useState<any[]>([]);
  const [specialFines, setSpecialFines] = useState<any[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .order('name');
      if (staffError) throw staffError;

      const { data: confData, error: confError } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', selectedMonth);
      if (confError) throw confError;

      const { data: payData, error: payError } = await supabase
        .from('salary_payments')
        .select('*')
        .eq('month', selectedMonth);
      if (payError) throw payError;

      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      const firstDay = `${selectedMonth}-01`;
      const lastDayNum = new Date(year, monthNum, 0).getDate();
      const lastDay = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (attError) throw attError;

      const { data: lfData, error: lfError } = await supabase
        .from('late_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (lfError) throw lfError;

      const { data: sfData, error: sfError } = await supabase
        .from('special_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (sfError) throw sfError;

      // Fetch approved leaves
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'approved')
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (leaveError) throw leaveError;

      if (staffData) setStaffList(staffData as unknown as Staff[]);
      if (confData) setConfirmations(confData);
      if (payData) setPayments(payData);
      setAttendanceRecords(attData || []);
      setLateFines(lfData || []);
      setSpecialFines(sfData || []);
      setLeaveRequests(leaveData || []);

    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const reportRecords = React.useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const baseRecords = confirmations.length > 0
      ? confirmations
      : staffList.filter(s => s.active).map(s => ({
          id: '',
          staff_id: s.id,
          base_salary: s.monthly_salary,
          paid_days: 30,
          leave_deduction: 0,
          ot_pay: 0,
          early_in_pay: 0,
          early_leave_deduction: 0,
          extra_leave_days: 0,
          ot_minutes: 0,
          confirmed_fines: 0,
          confirmed_special_fines: 0,
          confirmed_by: '',
          month: selectedMonth
        }));

    return baseRecords.map((c) => {
      const s = staffList.find((x) => x.id === c.staff_id);
      if (!s) return null;

      const staffAtt = attendanceRecords.filter((r) => r.staff_id === s.id);
      
      // Real days worked (present/late, not weekly off or holiday)
      const daysActuallyWorked = staffAtt.filter(
        (r) => r.check_in_time !== null &&
        r.day_type !== 'weekly_off' &&
        r.day_type !== 'holiday'
      ).length;

      // Count genuine absent days and approved leave days
      const staffLeaves = leaveRequests.filter(l => l.staff_id === s.id && l.status === 'approved');
      let genuineAbsentDays = 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const att = staffAtt.find(r => r.date === dateStr);
        const hasLeave = staffLeaves.some(l => l.date === dateStr);

        if (att) {
          if (att.status === 'absent' && att.day_type !== 'weekly_off' && att.day_type !== 'holiday' && !hasLeave) {
            genuineAbsentDays++;
          }
        } else {
          if (!hasLeave) {
            genuineAbsentDays++;
          }
        }
      }

      // Quota logic
      const offDaysPerMonth = s.off_days_per_month as 0 | 2 | 4;
      let earnedQuota = 0;
      if (offDaysPerMonth === 4) {
        earnedQuota = Math.min(Math.floor(daysActuallyWorked / 6), 4);
      } else if (offDaysPerMonth === 2) {
        earnedQuota = Math.min(Math.floor(daysActuallyWorked / 12), 2);
      }

      // Weekly offs taken (unique dates marked as weekly off in attendance, or as a weekly off leave request)
      const weeklyOffDates = new Set([
        ...staffAtt.filter(r => r.day_type === 'weekly_off').map(r => r.date),
        ...staffLeaves.filter(l => l.is_weekly_off === true).map(l => l.date)
      ]);
      const weeklyOffsTaken = weeklyOffDates.size;
      const weeklyOffsUsed = Math.min(weeklyOffsTaken, earnedQuota);

      // absences = calendarDays - daysActuallyWorked
      const absences = daysInMonth - daysActuallyWorked;

      // deductedDays = absences - weeklyOffsUsed + manualExtraLeaves
      const manualExtraLeaves = c.extra_leave_days || 0;
      const deductedDays = Math.max(0, absences - weeklyOffsUsed) + manualExtraLeaves;

      const missingDays = deductedDays;

      const approvedOTMinutes = staffAtt
        .filter((r) => r.ot_approved === true)
        .reduce((sum, r) => sum + (r.ot_minutes || 0), 0) || 0;

      const approvedEarlyInMinutes = staffAtt
        .filter((r) => r.early_in_approved === true)
        .reduce((sum, r) => sum + (r.early_in_minutes || 0), 0) || 0;

      const earlyLeaveMinutes = staffAtt.reduce(
        (sum, r) => sum + (r.early_leave_minutes || 0), 0
      ) || 0;

      const staffLateFines = lateFines.filter(
        (lf) => lf.staff_id === s.id && lf.confirmed
      );
      const totalLateFinesAmt = staffLateFines.reduce((sum, lf) => {
        const amt = Number(lf.fine_amount);
        const waivedAmt = Number(lf.waived_amount || 0);
        return sum + (lf.waived ? 0 : Math.max(0, amt - waivedAmt));
      }, 0);

      const staffSpecialFines = specialFines.filter(
        (sf) => sf.staff_id === s.id && sf.confirmed
      );
      const totalSpecialFinesAmt = staffSpecialFines.reduce((sum, sf) => {
        const amt = Number(sf.edited_amount ?? sf.amount);
        const waivedAmt = Number(sf.waived_amount || 0);
        return sum + (sf.waived ? 0 : Math.max(0, amt - waivedAmt));
      }, 0);

      const shiftHours = s.shift?.hours || 9;

      const breakdown = calculateSalary(
        {
          monthlySalary: c.base_salary,
          offDaysPerMonth,
          shiftHours,
          year,
          month: monthNum,
        },
        {
          daysActuallyWorked,
          confirmedLateFines: totalLateFinesAmt,
          confirmedSpecialFines: totalSpecialFinesAmt,
          approvedOTMinutes,
          approvedEarlyInMinutes,
          earlyLeaveMinutes,
          missingDays,
          late_salary_deduction_minutes: staffAtt.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0),
          leaves_taken: staffLeaves.filter(l => !l.is_weekly_off).length,
        }
      );

      const totalDed = (breakdown.calendarDays - breakdown.paidDays) * breakdown.dailyRate
        + breakdown.earlyLeaveDeduction
        + totalLateFinesAmt
        + totalSpecialFinesAmt;

      const totalAdd = breakdown.otPay + breakdown.earlyInPay;

      return {
        ...c,
        base_salary: c.base_salary,
        ot_pay: totalAdd,
        leave_deduction: totalDed,
        net_salary: Math.max(0, breakdown.netSalary),
      };
    }).filter(Boolean) as SalaryConfirmation[];
  }, [confirmations, staffList, attendanceRecords, lateFines, specialFines, leaveRequests, selectedMonth]);

  const getBranchStats = (branchId: string) => {
    const branchStaff = staffList.filter((s) => s.branch_id === branchId);
    const branchStaffIds = branchStaff.map((s) => s.id);
    
    const branchConfs = reportRecords.filter((c) => branchStaffIds.includes(c.staff_id));
    const branchPays = payments.filter((p) => branchStaffIds.includes(p.staff_id));

    const totalPayroll = branchConfs.reduce((sum, c) => sum + c.net_salary, 0);
    const totalOT = branchConfs.reduce((sum, c) => sum + c.ot_pay, 0);
    const totalDed = branchConfs.reduce((sum, c) => sum + c.leave_deduction, 0);
    
    return {
      totalPayroll,
      totalOT,
      totalDed,
      staffPaid: branchPays.length,
      staffTotal: branchConfs.length,
    };
  };

  const dailyStats = getBranchStats('daily');
  const hyperStats = getBranchStats('hypermarket');

  const totalBase = reportRecords.reduce((sum, c) => sum + c.base_salary, 0);
  const totalOT = reportRecords.reduce((sum, c) => sum + c.ot_pay, 0);
  const totalDed = reportRecords.reduce((sum, c) => sum + c.leave_deduction, 0);
  const netPayroll = reportRecords.reduce((sum, c) => sum + c.net_salary, 0);

  // --- Detailed Export (Daily In/Out) ---
  const handleDetailedExport = () => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    const format24h = (timeStr: string | null) => {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
      }
      return timeStr;
    };

    const wb = XLSX.utils.book_new();

    const detailedHeaders = [
      "SL.NO", "STAFF NAME", "BRANCH", "DEPARTMENT", "SHIFT", "DATE", "DAY", 
      "CHECK IN", "CHECK OUT", "ACTUAL HOURS", "SHIFT HOURS", "STATUS", 
      "DAY TYPE", "LATE MINS", "OT MINS", "OT APPROVED", "EARLY IN MINS", 
      "EARLY LEAVE MINS", "LATE FINE", "FINE STATUS"
    ];

    const detailedRows: any[][] = [detailedHeaders];
    const sortedStaff = [...staffList].sort((a, b) => a.name.localeCompare(b.name));
    let globalRowIndex = 0;

    sortedStaff.forEach((s) => {
      const staffAtt = attendanceRecords.filter((r) => r.staff_id === s.id);
      const staffLeaves = leaveRequests.filter(
        (l: any) => l.staff_id === s.id && l.status === 'approved'
      );

      for (let d = 1; d <= daysInMonth; d++) {
        globalRowIndex++;
        const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
        const att = staffAtt.find((r: any) => r.date === dateStr);
        const hasLeave = staffLeaves.find((l: any) => l.date === dateStr);

        const isHourly = s.pay_type === 'hourly';
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayName = dayNames[dateObj.getDay()];

        let checkIn = '';
        let checkOut = '';
        let actualHours = 0;
        const shiftHours = isHourly ? (s.standard_hours || 234) : (s.shift?.hours || 9);
        let status = 'absent';
        let lateMins = 0;
        let otMins = 0;
        let otApproved = 'No';
        let earlyInMins = 0;
        let earlyInApproved = 'No';
        let earlyLeaveMins = 0;
        let dayType = isHourly ? 'hourly' : 'present';

        if (att) {
          checkIn = format24h(att.check_in_time);
          checkOut = format24h(att.check_out_time);
          
          if (isHourly && att.total_hours_logged) {
            actualHours = Math.round(Number(att.total_hours_logged) * 100) / 100;
          } else if (att.actual_hours_worked) {
            actualHours = Math.round(Number(att.actual_hours_worked) * 100) / 100;
          } else if (checkIn && checkOut) {
            const [ih, im] = checkIn.split(':').map(Number);
            const [oh, om] = checkOut.split(':').map(Number);
            const mins = (oh * 60 + om) - (ih * 60 + im);
            actualHours = mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
          }
          status = att.status || '';
          lateMins = isHourly ? 0 : (att.minutes_late || 0);
          otMins = isHourly ? 0 : (att.ot_minutes || 0);
          otApproved = isHourly ? 'No' : (att.ot_approved ? 'Yes' : 'No');
          earlyInMins = isHourly ? 0 : (att.early_in_minutes || 0);
          earlyInApproved = isHourly ? 'No' : (att.early_in_approved ? 'Yes' : 'No');
          earlyLeaveMins = isHourly ? 0 : (att.early_leave_minutes || 0);
          dayType = isHourly ? 'hourly' : (att.day_type || 'present');
        } else if (hasLeave && !isHourly) {
          dayType = hasLeave.is_weekly_off ? 'weekly_off' : 'leave';
        } else if (isHourly) {
          status = 'N/A';
          dayType = 'hourly';
        }

        const lf = isHourly ? null : lateFines.find((f: any) => f.staff_id === s.id && f.date === dateStr);
        const lateFineAmt = lf ? Number(lf.fine_amount) : 0;
        let fineStatus = isHourly ? 'N/A' : '';
        if (lf) {
          if (lf.waived) fineStatus = 'Waived';
          else if (lf.confirmed) fineStatus = 'Confirmed';
          else fineStatus = 'Pending';
        }

        detailedRows.push([
          globalRowIndex,
          s.name,
          s.branch?.name || s.branch_id || '',
          s.department || '',
          isHourly ? 'Hourly' : (s.shift?.label || 'N/A'),
          dateStr,
          dayName,
          checkIn,
          checkOut,
          actualHours,
          shiftHours,
          status,
          dayType,
          lateMins,
          otMins,
          otApproved,
          earlyInMins,
          earlyLeaveMins,
          lateFineAmt,
          fineStatus
        ]);
      }
    });

    const wsDetailed = XLSX.utils.aoa_to_sheet(detailedRows);

    const colWidths = detailedHeaders.map((_, colIndex) => {
      let maxLen = 10;
      detailedRows.forEach(row => {
        const val = row[colIndex];
        if (val !== null && val !== undefined) {
          const len = String(val).length;
          if (len > maxLen) maxLen = len;
        }
      });
      return { wch: maxLen + 2 };
    });
    wsDetailed['!cols'] = colWidths;

    const headerStyle = {
      fill: { fgColor: { rgb: "1E2028" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "CCCCCC" } },
        bottom: { style: "thin", color: { rgb: "CCCCCC" } },
        left: { style: "thin", color: { rgb: "CCCCCC" } },
        right: { style: "thin", color: { rgb: "CCCCCC" } }
      }
    };

    const presentStyle = { fill: { fgColor: { rgb: "E6F4EA" } }, font: { sz: 9 } };
    const lateStyle = { fill: { fgColor: { rgb: "FEF3C7" } }, font: { sz: 9 } };
    const absentStyle = { fill: { fgColor: { rgb: "FCE8E6" } }, font: { sz: 9 } };
    const weeklyOffStyle = { fill: { fgColor: { rgb: "E8F0FE" } }, font: { sz: 9 } };
    const holidayStyle = { fill: { fgColor: { rgb: "F3E8FF" } }, font: { sz: 9 } };
    const defaultStyleEven = { fill: { fgColor: { rgb: "FFFFFF" } }, font: { sz: 9 } };
    const defaultStyleOdd = { fill: { fgColor: { rgb: "F9F9F9" } }, font: { sz: 9 } };

    for (let r = 0; r < detailedRows.length; r++) {
      const rowData = detailedRows[r];
      const statusVal = rowData[11];
      const dayTypeVal = rowData[12];

      let rowStyle = r % 2 === 0 ? defaultStyleEven : defaultStyleOdd;
      if (r > 0) {
        if (dayTypeVal === 'weekly_off') {
          rowStyle = weeklyOffStyle;
        } else if (dayTypeVal === 'holiday') {
          rowStyle = holidayStyle;
        } else if (statusVal === 'late') {
          rowStyle = lateStyle;
        } else if (statusVal === 'absent') {
          rowStyle = absentStyle;
        } else if (statusVal === 'present') {
          rowStyle = presentStyle;
        }
      }

      for (let c = 0; c < detailedHeaders.length; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!wsDetailed[cellRef]) continue;

        if (r === 0) {
          wsDetailed[cellRef].s = headerStyle;
        } else {
          wsDetailed[cellRef].s = rowStyle;
        }
      }
    }

    XLSX.utils.book_append_sheet(wb, wsDetailed, 'Daily Details');
    XLSX.writeFile(wb, `Nearbi_Detailed_Attendance_${monthStr}_${yearStr}.xlsx`);
  };

  // --- Monthly Summary Export ---
  const createStyledSummarySheet = (dataRows: any[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(dataRows);

    // Auto-fit widths
    const colWidths = dataRows[0].map((_, colIndex) => {
      let maxLen = 10;
      dataRows.forEach(row => {
        const val = row[colIndex];
        if (val !== null && val !== undefined) {
          const len = String(val).length;
          if (len > maxLen) maxLen = len;
        }
      });
      return { wch: maxLen + 2 };
    });
    ws['!cols'] = colWidths;

    // Heights: header (30px), data (22px), totals (24px)
    ws['!rows'] = dataRows.map((_, r) => {
      if (r === 0) return { hpt: 30 };
      if (r === dataRows.length - 1) return { hpt: 24 };
      return { hpt: 22 };
    });

    // Freeze top row
    ws['!views'] = [
      {
        pane: {
          state: 'frozen',
          xSplit: 0,
          ySplit: 1,
          topLeftCell: 'A2',
          activePane: 'bottomLeft'
        }
      }
    ];

    const headerStyle = {
      fill: { fgColor: { rgb: "1E2028" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "333333" } },
        bottom: { style: "thin", color: { rgb: "333333" } },
        left: { style: "thin", color: { rgb: "333333" } },
        right: { style: "thin", color: { rgb: "333333" } }
      }
    };

    const totalsStyle = {
      fill: { fgColor: { rgb: "1E2028" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      border: {
        top: { style: "medium", color: { rgb: "1E2028" } },
        bottom: { style: "double", color: { rgb: "1E2028" } },
        left: { style: "thin", color: { rgb: "333333" } },
        right: { style: "thin", color: { rgb: "333333" } }
      }
    };

    for (let r = 0; r < dataRows.length; r++) {
      const rowData = dataRows[r];
      const statusVal = rowData[21]; // STATUS is index 21

      let rowStyle: any = {
        fill: { fgColor: { rgb: r % 2 === 0 ? "FFFFFF" : "F8F8F8" } },
        font: { sz: 9 },
        border: {
          top: { style: "thin", color: { rgb: "EAEAEA" } },
          bottom: { style: "thin", color: { rgb: "EAEAEA" } },
          left: { style: "thin", color: { rgb: "EAEAEA" } },
          right: { style: "thin", color: { rgb: "EAEAEA" } }
        }
      };

      if (r > 0 && r < dataRows.length - 1) {
        if (statusVal === 'Pending') {
          rowStyle = {
            fill: { fgColor: { rgb: "FFFBEB" } },
            font: { sz: 9 },
            border: rowStyle.border
          };
        } else if (statusVal === 'Changed') {
          rowStyle = {
            fill: { fgColor: { rgb: "FFF5F5" } },
            font: { sz: 9 },
            border: rowStyle.border
          };
        }
      }

      for (let c = 0; c < dataRows[r].length; c++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws[cellRef]) continue;

        // Alignment: Names & Notes left-aligned, Status centered, Others right-aligned
        const alignment = (c === 1 || c === 2 || c === 3 || c === 22)
          ? { horizontal: "left", vertical: "center" }
          : (c === 0 || c === 21)
            ? { horizontal: "center", vertical: "center" }
            : { horizontal: "right", vertical: "center" };

        if (r === 0) {
          ws[cellRef].s = headerStyle;
        } else if (r === dataRows.length - 1) {
          ws[cellRef].s = {
            ...totalsStyle,
            alignment
          };
          const val = dataRows[r][c];
          if (typeof val === 'number') {
            ws[cellRef].t = 'n';
            ws[cellRef].z = '0.00';
          }
        } else {
          let cellStyle = {
            ...rowStyle,
            alignment
          };

          // Custom formatting for STATUS column text color
          if (c === 21) {
            let statusColor = "1A1A1A";
            if (statusVal === "Confirmed") statusColor = "10B981";
            else if (statusVal === "Pending") statusColor = "F59E0B";
            else if (statusVal === "Changed") statusColor = "EF4444";
            cellStyle = {
              ...cellStyle,
              font: {
                ...cellStyle.font,
                bold: true,
                color: { rgb: statusColor }
              }
            };
          }

          ws[cellRef].s = cellStyle;
          const val = dataRows[r][c];
          if (typeof val === 'number') {
            ws[cellRef].t = 'n';
            ws[cellRef].z = '0.00';
          }
        }
      }
    }

    return ws;
  };

  const handleMonthlySummaryExport = async () => {
    try {
      setExporting(true);
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr);
      const daysInMonth = new Date(year, monthNum, 0).getDate();
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const firstDay = `${selectedMonth}-01`;
      const lastDayNum = new Date(year, monthNum, 0).getDate();
      const lastDay = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;

      const format24h = (timeStr: string | null) => {
        if (!timeStr) return '';
        const parts = timeStr.split(':');
        if (parts.length >= 2) {
          return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        return timeStr;
      };

      // 1. Fetch fresh active staff list
      const { data: freshStaff, error: staffErr } = await supabase
        .from('staff')
        .select('*, branch:branches(name), shift:shifts(*)')
        .order('name');
      if (staffErr) throw staffErr;

      // 2. Fetch fresh salary confirmations
      const { data: freshConfs, error: confErr } = await supabase
        .from('salary_confirmations')
        .select('*')
        .eq('month', selectedMonth);
      if (confErr) throw confErr;

      // 3. Fetch fresh attendance
      const { data: freshAtt, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (attErr) throw attErr;

      // 4. Fetch fresh late fines
      const { data: freshLateFines, error: lfErr } = await supabase
        .from('late_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (lfErr) throw lfErr;

      // 5. Fetch fresh special fines
      const { data: freshSpecialFines, error: sfErr } = await supabase
        .from('special_fines')
        .select('*')
        .eq('month', selectedMonth);
      if (sfErr) throw sfErr;

      // 6. Fetch fresh leave requests
      const { data: freshLeaves, error: leaveErr } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('status', 'approved')
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (leaveErr) throw leaveErr;

      // 7. Fetch fresh adjustments
      const { data: freshAdjs, error: adjErr } = await supabase
        .from('attendance_adjustments')
        .select('*')
        .eq('status', 'approved')
        .gte('date', firstDay)
        .lte('date', lastDay);
      if (adjErr) throw adjErr;

      const activeStaff = (freshStaff || []).filter((s: any) => s.active).sort((a: any, b: any) => a.name.localeCompare(b.name));

      const getSummaryRows = (list: any[]) => {
        const rowsAOA: any[][] = [];
        const headers = [
          'SL.NO', 'NAME', 'BRANCH', 'DEPARTMENT',
          'DAYS PRESENT', 'WEEKLY OFF USED', 'BONUS DAYS EARNED',
          'PAID DAYS (LIVE)', 'BASE SALARY', 'DAILY RATE', 'GROSS PAY',
          'OT APPROVED MINS', 'OT PAY (₹)',
          'EARLY-IN APPROVED MINS', 'EARLY-IN PAY (₹)',
          'LATE ARRIVAL DEDUCTION (₹)', 'EARLY LEAVE DEDUCTION (₹)',
          'LATE FINES CONFIRMED (₹)', 'SPECIAL FINES (₹)',
          'NET SALARY — LIVE (₹)', 'NET SALARY — CONFIRMED (₹)',
          'STATUS', 'NOTE'
        ];
        rowsAOA.push(headers);

        let slNo = 0;
        list.forEach((s) => {
          slNo++;
          const staffAtt = (freshAtt || []).filter((r: any) => r.staff_id === s.id);
          const staffLeaves = (freshLeaves || []).filter((l: any) => l.staff_id === s.id);
          const conf = (freshConfs || []).find((c: any) => c.staff_id === s.id);

          const isHourly = s.pay_type === 'hourly';
          const shiftHours = s.shift?.hours || 9;

          // Days present: check_in_time is not null/empty
          const daysActuallyWorked = staffAtt.filter(
            (r: any) => r.check_in_time !== null && r.check_in_time !== undefined && r.check_in_time !== ''
          ).length;

          // Count genuine absent days and approved leave days
          let genuineAbsentDays = 0;
          for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
            const att = staffAtt.find((r: any) => r.date === dateStr);
            const hasLeave = staffLeaves.some((l: any) => l.date === dateStr);

            if (att) {
              if (att.status === 'absent' && att.day_type !== 'weekly_off' && att.day_type !== 'holiday' && !hasLeave) {
                genuineAbsentDays++;
              }
            } else {
              if (!hasLeave) {
                genuineAbsentDays++;
              }
            }
          }

          const offDaysPerMonth = s.off_days_per_month as 0 | 2 | 4;
          let earnedQuota = 0;
          if (offDaysPerMonth === 4) {
            earnedQuota = Math.min(Math.floor(daysActuallyWorked / 6), 4);
          } else if (offDaysPerMonth === 2) {
            earnedQuota = Math.min(Math.floor(daysActuallyWorked / 12), 2);
          }

          const weeklyOffDates = new Set([
            ...staffAtt.filter((r: any) => r.day_type === 'weekly_off').map((r: any) => r.date),
            ...staffLeaves.filter((l: any) => l.is_weekly_off === true).map((l: any) => l.date)
          ]);
          const weeklyOffsTaken = weeklyOffDates.size;
          const weeklyOffsUsed = Math.min(weeklyOffsTaken, earnedQuota);

          const absences = daysInMonth - daysActuallyWorked;
          const manualExtraLeaves = conf?.extra_leave_days || 0;
          const deductedDays = Math.max(0, absences - weeklyOffsUsed) + manualExtraLeaves;
          const missingDays = deductedDays;

          const approvedOTMinutes = staffAtt
            .filter((r: any) => r.ot_approved === true)
            .reduce((sum: number, r: any) => sum + (r.ot_minutes || 0), 0) || 0;

          const approvedEarlyInMinutes = staffAtt
            .filter((r: any) => r.early_in_approved === true)
            .reduce((sum: number, r: any) => sum + (r.early_in_minutes || 0), 0) || 0;

          const earlyLeaveMinutes = staffAtt.reduce(
            (sum: number, r: any) => sum + (r.early_leave_minutes || 0), 0
          ) || 0;

          const staffLateFines = (freshLateFines || []).filter(
            (lf: any) => lf.staff_id === s.id && lf.confirmed
          );
          const totalLateFinesAmt = staffLateFines.reduce((sum: number, lf: any) => {
            const amt = Number(lf.fine_amount);
            const waivedAmt = Number(lf.waived_amount || 0);
            return sum + (lf.waived ? 0 : Math.max(0, amt - waivedAmt));
          }, 0);

          const staffSpecialFinesArr = (freshSpecialFines || []).filter(
            (sf: any) => sf.staff_id === s.id && sf.confirmed
          );
          const totalSpecialFinesAmt = staffSpecialFinesArr.reduce((sum: number, sf: any) => {
            const amt = Number(sf.edited_amount ?? sf.amount);
            const waivedAmt = Number(sf.waived_amount || 0);
            return sum + (sf.waived ? 0 : Math.max(0, amt - waivedAmt));
          }, 0);

          const dailyRate = s.monthly_salary / daysInMonth;
          const hourlyRate = dailyRate / shiftHours;

          let liveNetSalary = 0;
          let grossPay = 0;
          let otPay = 0;
          let earlyInPay = 0;
          let earlyLeaveDeduction = 0;
          let lateSalaryDeduction = 0;
          let paidDays = 0;

          if (isHourly) {
            const standardHours = conf?.standard_hours ?? s.standard_hours ?? 234;
            const hrRate = conf?.hourly_rate ?? (s.monthly_salary / standardHours);
            const totalHoursLogged = conf?.total_hours_logged ?? staffAtt.reduce((sum, r) => sum + Number(r.total_hours_logged || 0), 0);
            liveNetSalary = Math.round(totalHoursLogged * hrRate);
            grossPay = liveNetSalary;
          } else {
            const breakdown = calculateSalary(
              { monthlySalary: s.monthly_salary, offDaysPerMonth, shiftHours, year, month: monthNum },
              {
                daysActuallyWorked,
                confirmedLateFines: totalLateFinesAmt,
                confirmedSpecialFines: totalSpecialFinesAmt,
                approvedOTMinutes,
                approvedEarlyInMinutes,
                earlyLeaveMinutes,
                missingDays,
                late_salary_deduction_minutes: staffAtt.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0),
                leaves_taken: staffLeaves.filter(l => !l.is_weekly_off).length,
              }
            );
            paidDays = breakdown.paidDays;
            grossPay = breakdown.grossPay;
            otPay = breakdown.otPay;
            earlyInPay = breakdown.earlyInPay;
            earlyLeaveDeduction = breakdown.earlyLeaveDeduction;
            lateSalaryDeduction = breakdown.lateSalaryDeduction;
            liveNetSalary = Math.max(0, breakdown.netSalary);
          }

          const confirmedNetSalary = conf ? Number(conf.net_salary) : 'PENDING';
          
          let status = 'Pending';
          let note = '';
          if (conf) {
            const diff = Math.abs(Math.round(liveNetSalary) - Math.round(Number(conf.net_salary)));
            if (diff > 1) {
              status = 'Changed';
              note = 'Data changed after confirmation';
            } else {
              status = 'Confirmed';
            }
          }

          rowsAOA.push([
            slNo,
            s.name,
            s.branch?.name || s.branch_id || '',
            s.department || '',
            Number(daysActuallyWorked),
            Number(weeklyOffsUsed),
            Number(Math.floor(daysActuallyWorked / 6)), // bonus days earned
            Number(paidDays),
            Number(s.monthly_salary),
            Number(Math.round(dailyRate * 100) / 100),
            Number(Math.round(grossPay * 100) / 100),
            Number(approvedOTMinutes),
            Number(Math.round(otPay * 100) / 100),
            Number(approvedEarlyInMinutes),
            Number(Math.round(earlyInPay * 100) / 100),
            Number(Math.round(lateSalaryDeduction * 100) / 100),
            Number(Math.round(earlyLeaveDeduction * 100) / 100),
            Number(Math.round(totalLateFinesAmt * 100) / 100),
            Number(Math.round(totalSpecialFinesAmt * 100) / 100),
            Number(Math.round(liveNetSalary * 100) / 100),
            confirmedNetSalary,
            status,
            note
          ]);
        });

        const totalsRow = ['', 'TOTAL', '', '', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, '', ''];
        for (let ci = 4; ci <= 20; ci++) {
          let sum = 0;
          let hasNumber = false;
          for (let ri = 1; ri < rowsAOA.length; ri++) {
            const val = rowsAOA[ri][ci];
            if (typeof val === 'number') {
              sum += val;
              hasNumber = true;
            }
          }
          if (hasNumber) {
            totalsRow[ci] = Math.round(sum * 100) / 100;
          } else {
            totalsRow[ci] = '';
          }
        }
        rowsAOA.push(totalsRow);

        return rowsAOA;
      };

      const summaryRows = getSummaryRows(activeStaff);
      const wsAll = createStyledSummarySheet(summaryRows);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsAll, 'Summary');

      let indSlNo = 0;
      activeStaff.forEach((s: any) => {
        indSlNo++;
        const staffAtt = (freshAtt || []).filter((r: any) => r.staff_id === s.id);
        const staffLeaves = (freshLeaves || []).filter((l: any) => l.staff_id === s.id);
        const conf = (freshConfs || []).find((c: any) => c.staff_id === s.id);

        const isHourly = s.pay_type === 'hourly';
        const shiftHours = s.shift?.hours || 9;

        // Days present: check_in_time is not null/empty
        const daysActuallyWorked = staffAtt.filter(
          (r: any) => r.check_in_time !== null && r.check_in_time !== undefined && r.check_in_time !== ''
        ).length;

        const offDaysPerMonth = s.off_days_per_month as 0 | 2 | 4;
        let earnedQuota = 0;
        if (offDaysPerMonth === 4) {
          earnedQuota = Math.min(Math.floor(daysActuallyWorked / 6), 4);
        } else if (offDaysPerMonth === 2) {
          earnedQuota = Math.min(Math.floor(daysActuallyWorked / 12), 2);
        }

        const weeklyOffDates = new Set([
          ...staffAtt.filter((r: any) => r.day_type === 'weekly_off').map((r: any) => r.date),
          ...staffLeaves.filter((l: any) => l.is_weekly_off === true).map((l: any) => l.date)
        ]);
        const weeklyOffsTaken = weeklyOffDates.size;
        const weeklyOffsUsed = Math.min(weeklyOffsTaken, earnedQuota);

        const absences = daysInMonth - daysActuallyWorked;
        const manualExtraLeaves = conf?.extra_leave_days || 0;
        const deductedDays = Math.max(0, absences - weeklyOffsUsed) + manualExtraLeaves;
        const missingDays = deductedDays;

        const approvedOTMinutes = staffAtt
          .filter((r: any) => r.ot_approved === true)
          .reduce((sum: number, r: any) => sum + (r.ot_minutes || 0), 0) || 0;

        const approvedEarlyInMinutes = staffAtt
          .filter((r: any) => r.early_in_approved === true)
          .reduce((sum: number, r: any) => sum + (r.early_in_minutes || 0), 0) || 0;

        const earlyLeaveMinutes = staffAtt.reduce(
          (sum: number, r: any) => sum + (r.early_leave_minutes || 0), 0
        ) || 0;

        const staffLateFines = (freshLateFines || []).filter(
          (lf: any) => lf.staff_id === s.id && lf.confirmed
        );
        const totalLateFinesAmt = staffLateFines.reduce((sum: number, lf: any) => {
          const amt = Number(lf.fine_amount);
          const waivedAmt = Number(lf.waived_amount || 0);
          return sum + (lf.waived ? 0 : Math.max(0, amt - waivedAmt));
        }, 0);

        const staffSpecialFinesArr = (freshSpecialFines || []).filter(
          (sf: any) => sf.staff_id === s.id && sf.confirmed
        );
        const totalSpecialFinesAmt = staffSpecialFinesArr.reduce((sum: number, sf: any) => {
          const amt = Number(sf.edited_amount ?? sf.amount);
          const waivedAmt = Number(sf.waived_amount || 0);
          return sum + (sf.waived ? 0 : Math.max(0, amt - waivedAmt));
        }, 0);

        let liveNetSalary = 0;
        if (isHourly) {
          const standardHours = conf?.standard_hours ?? s.standard_hours ?? 234;
          const hrRate = conf?.hourly_rate ?? (s.monthly_salary / standardHours);
          const totalHoursLogged = conf?.total_hours_logged ?? staffAtt.reduce((sum, r) => sum + Number(r.total_hours_logged || 0), 0);
          liveNetSalary = Math.round(totalHoursLogged * hrRate);
        } else {
          const breakdown = calculateSalary(
            { monthlySalary: s.monthly_salary, offDaysPerMonth, shiftHours, year, month: monthNum },
            {
              daysActuallyWorked,
              confirmedLateFines: totalLateFinesAmt,
              confirmedSpecialFines: totalSpecialFinesAmt,
              approvedOTMinutes,
              approvedEarlyInMinutes,
              earlyLeaveMinutes,
              missingDays,
              late_salary_deduction_minutes: staffAtt.reduce((sum, r) => sum + (r.late_salary_deduction_minutes || 0), 0),
              leaves_taken: staffLeaves.filter(l => !l.is_weekly_off).length,
            }
          );
          liveNetSalary = Math.max(0, breakdown.netSalary);
        }

        const confirmedNetSalary = conf ? Number(conf.net_salary) : 'PENDING';

        const staffDetailedHeaders = [
          "DATE", "DAY", "CHECK IN", "CHECK OUT", "ACTUAL HOURS", "STATUS", "DAY TYPE", "LATE MINUTES", "OT MINUTES", "LATE FINE"
        ];
        const staffDetailedRows: any[][] = [
          ["NAME:", s.name, "", "", "", "", "", "", "", ""],
          ["CONFIRMED SALARY:", typeof confirmedNetSalary === 'number' ? Number(confirmedNetSalary) : confirmedNetSalary, "", "", "", "", "", "", "", ""],
          ["LIVE SALARY:", Number(Math.round(liveNetSalary * 100) / 100), "", "", "", "", "", "", "", ""],
          [], // empty spacer row
          staffDetailedHeaders
        ];

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
          const att = staffAtt.find((r: any) => r.date === dateStr);
          const hasLeave = staffLeaves.find((l: any) => l.date === dateStr);

          const dateObj = new Date(dateStr + 'T00:00:00');
          const dayName = dayNames[dateObj.getDay()];

          let checkIn = '';
          let checkOut = '';
          let actualHours = 0;
          let status = 'absent';
          let lateMins = 0;
          let otMins = 0;
          let dayType = isHourly ? 'hourly' : 'present';

          if (att) {
            checkIn = format24h(att.check_in_time);
            checkOut = format24h(att.check_out_time);
            if (isHourly && att.total_hours_logged) {
              actualHours = Math.round(Number(att.total_hours_logged) * 100) / 100;
            } else if (att.actual_hours_worked) {
              actualHours = Math.round(Number(att.actual_hours_worked) * 100) / 100;
            }
            status = att.status || '';
            lateMins = isHourly ? 0 : (att.minutes_late || 0);
            otMins = isHourly ? 0 : (att.ot_minutes || 0);
            dayType = isHourly ? 'hourly' : (att.day_type || 'present');
          } else if (hasLeave && !isHourly) {
            dayType = hasLeave.is_weekly_off ? 'weekly_off' : 'leave';
          } else if (isHourly) {
            status = 'N/A';
            dayType = 'hourly';
          }

          const lf = isHourly ? null : (freshLateFines || []).find((f: any) => f.staff_id === s.id && f.date === dateStr);
          const lateFineAmt = lf ? Number(lf.fine_amount) : 0;

          staffDetailedRows.push([
            dateStr,
            dayName,
            checkIn,
            checkOut,
            actualHours,
            status,
            dayType,
            lateMins,
            otMins,
            lateFineAmt
          ]);
        }

        const wsStaff = XLSX.utils.aoa_to_sheet(staffDetailedRows);

        const sColWidths = staffDetailedHeaders.map((_, colIndex) => {
          let maxLen = 8;
          staffDetailedRows.forEach(row => {
            const val = row[colIndex];
            if (val !== null && val !== undefined) {
              const len = String(val).length;
              if (len > maxLen) maxLen = len;
            }
          });
          return { wch: maxLen + 2 };
        });
        wsStaff['!cols'] = sColWidths;

        const sHeaderStyle = {
          fill: { fgColor: { rgb: "1A1A1A" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
          alignment: { horizontal: "center", vertical: "center" }
        };

        const sDefaultStyleEven = { fill: { fgColor: { rgb: "FFFFFF" } }, font: { sz: 9 } };
        const sDefaultStyleOdd = { fill: { fgColor: { rgb: "F9F9F9" } }, font: { sz: 9 } };
        const sWeeklyOffStyle = { fill: { fgColor: { rgb: "E8F0FE" } }, font: { sz: 9 } };
        const sAbsentStyle = { fill: { fgColor: { rgb: "FCE8E6" } }, font: { sz: 9 } };

        const summaryLabelStyle = {
          font: { bold: true, sz: 10, color: { rgb: "1A1A1A" } },
          fill: { fgColor: { rgb: "F2F2F2" } },
          alignment: { horizontal: "left", vertical: "center" }
        };
        const summaryValueStyle = {
          font: { bold: true, sz: 10, color: { rgb: "1A1A1A" } },
          fill: { fgColor: { rgb: "FFFFFF" } },
          alignment: { horizontal: "left", vertical: "center" }
        };

        for (let r = 0; r < staffDetailedRows.length; r++) {
          const rowData = staffDetailedRows[r];
          const statusVal = rowData[5];
          const dayTypeVal = rowData[6];

          let cellStyle = r % 2 === 0 ? sDefaultStyleEven : sDefaultStyleOdd;
          if (r >= 5) {
            if (dayTypeVal === 'weekly_off') {
              cellStyle = sWeeklyOffStyle;
            } else if (statusVal === 'absent') {
              cellStyle = sAbsentStyle;
            }
          }

          for (let c = 0; c < staffDetailedHeaders.length; c++) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            if (!wsStaff[cellRef]) continue;

            if (r < 3) {
              if (c === 0) {
                wsStaff[cellRef].s = summaryLabelStyle;
              } else if (c === 1) {
                wsStaff[cellRef].s = summaryValueStyle;
                if (r > 0 && typeof rowData[c] === 'number') {
                  wsStaff[cellRef].t = 'n';
                  wsStaff[cellRef].z = '0.00';
                }
              } else {
                wsStaff[cellRef].s = { fill: { fgColor: { rgb: "FFFFFF" } } };
              }
            } else if (r === 3) {
              wsStaff[cellRef].s = { fill: { fgColor: { rgb: "FFFFFF" } } };
            } else if (r === 4) {
              wsStaff[cellRef].s = sHeaderStyle;
            } else {
              wsStaff[cellRef].s = cellStyle;
              if (c === 4 || c === 7 || c === 8 || c === 9) {
                const val = rowData[c];
                if (typeof val === 'number') {
                  wsStaff[cellRef].t = 'n';
                  wsStaff[cellRef].z = '0.00';
                }
              }
            }
          }
        }

        const sheetName = `${s.name.substring(0, 25)} (${indSlNo})`;
        XLSX.utils.book_append_sheet(wb, wsStaff, sheetName);
      });

      XLSX.writeFile(wb, `Nearbi_Salary_${monthStr}_${yearStr}.xlsx`);
    } catch (err) {
      console.error('Error generating report:', err);
      alert('Error generating report, please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[42px] w-full" />
        <div className="skeleton h-[200px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 select-none pb-6">
      {exporting && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white border border-[#E8E8E8] rounded-2xl p-6 shadow-xl flex flex-col items-center space-y-4 max-w-xs text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-xs font-bold text-[#1A1A1A]">Generating report...</p>
            <p className="text-[10px] text-gray-500 font-semibold">Querying fresh database records and compiling salary calculations...</p>
          </div>
        </div>
      )}
      {/* Selection row (Hidden on print) */}
      <div className="print:hidden space-y-4">
        {!propMonth && (
          <div>
            <label className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Select Report Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-[#F8F8F8] border border-[#E8E8E8] rounded-[12px] p-3 text-xs font-bold text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A]"
            >
              {months.map((m) => (
                <option key={m} value={m} className="bg-white text-[#1A1A1A]">
                  {formatMonthDisplay(m)}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleDetailedExport}
          className="w-full min-h-[44px] bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:bg-emerald-700 cursor-pointer"
        >
          <Download size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Detailed Export (Daily In/Out)</span>
        </button>

        <button
          onClick={handleMonthlySummaryExport}
          className="w-full min-h-[44px] bg-blue-600 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:bg-blue-700 cursor-pointer"
        >
          <Download size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Monthly Summary</span>
        </button>

        <button
          onClick={() => window.print()}
          className="w-full min-h-[44px] bg-[#1A1A1A] text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-1.5 active:scale-95 transition-all shadow hover:bg-[#333333] cursor-pointer"
        >
          <Download size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
          <span>Download / Print Report</span>
        </button>
      </div>

      {confirmations.length === 0 && (
        <div className="bg-[#FFF8E7] border border-[#FFEBAA] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between text-xs print:hidden shadow-sm gap-3">
          <div className="text-[#B8860B] font-semibold">
            Salaries for {formatMonthDisplay(selectedMonth)} have not been confirmed yet. Run Bulk Confirm first to generate the monthly report.
          </div>
          {onGoToBulkConfirm && (
            <button
              onClick={onGoToBulkConfirm}
              className="bg-[#B8860B] hover:bg-[#9E720A] text-white text-xs font-extrabold px-4 py-2 rounded-lg active:scale-95 transition-all cursor-pointer whitespace-nowrap"
            >
              Go to Bulk Confirm &rarr;
            </button>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-bold px-4 py-3 rounded-[12px] flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={fetchData} className="text-xs underline font-bold">
            Retry
          </button>
        </div>
      )}

      {/* Main printable report page wrapper */}
      <div className="bg-white border border-[#E8E8E8] rounded-[14px] p-6 shadow-sm overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
        
        {/* Document Header */}
        <div className="border-b-2 border-[#1A1A1A] print:border-black pb-4 mb-5 flex justify-between items-end">
          <div>
            <div className="font-[900] text-xl tracking-tight flex mb-1 leading-none">
              <span className="text-[#1A1A1A] print:text-black">near</span>
              <span className="text-[#1A1A1A]/60 print:text-[#F5A800]">bi</span>
            </div>
            <h1 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] print:text-gray-500">
              Monthly Salary Ledger
            </h1>
          </div>
          <div className="text-right leading-tight">
            <div className="text-sm font-bold text-[#1A1A1A] print:text-black">
              {formatMonthDisplay(selectedMonth)}
            </div>
            <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-semibold uppercase mt-0.5">
              Issued {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Overview Grid */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              1. Ledger Overview
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-[#1A1A1A] print:text-black">{staffList.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Active Staff</div>
              </div>
              <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-xl p-3 print:bg-gray-50 print:border-gray-150">
                <div className="text-lg font-bold text-[#1A1A1A] print:text-black">{confirmations.length}</div>
                <div className="text-[9px] text-[var(--text-muted)] print:text-gray-500 font-bold uppercase mt-0.5">Confirmed</div>
              </div>
              <div className="bg-[var(--success-bg)] border border-[var(--success)]/20 rounded-xl p-3 text-[var(--success)] print:bg-green-50 print:border-green-100 print:text-green-800">
                <div className="text-lg font-bold">{payments.length}</div>
                <div className="text-[9px] font-bold uppercase mt-0.5">Paid Payouts</div>
              </div>
            </div>
          </section>

          {/* Branch summaries */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              2. Branch Payroll Breaks
            </h2>
            <div className="grid grid-cols-2 gap-3.5">
              <div className="border border-[#E8E8E8] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-[#1A1A1A] print:text-black border-b border-[#E8E8E8] print:border-gray-100 pb-1.5">
                  Nearbi Daily
                </h3>
                <div className="space-y-1.5 text-xs text-[#555555] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(dailyStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[var(--success)] print:text-green-700">+{formatCurrency(dailyStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[var(--danger)] print:text-red-700">-{formatCurrency(dailyStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#E8E8E8] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{dailyStats.staffPaid} / {dailyStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>

              <div className="border border-[#E8E8E8] print:border-gray-200 rounded-lg p-3.5 space-y-2">
                <h3 className="font-bold text-xs text-[#1A1A1A] print:text-black border-b border-[#E8E8E8] print:border-gray-100 pb-1.5">
                  Nearbi Hypermarket
                </h3>
                <div className="space-y-1.5 text-xs text-[#555555] print:text-gray-500 font-semibold">
                  <div className="flex justify-between">
                    <span>Gross Salary:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(hyperStats.totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overtime Paid:</span>
                    <span className="text-[var(--success)] print:text-green-700">+{formatCurrency(hyperStats.totalOT)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Deductions:</span>
                    <span className="text-[var(--danger)] print:text-red-700">-{formatCurrency(hyperStats.totalDed)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#E8E8E8] print:border-gray-100 mt-1.5 text-[10px]">
                    <span>Payout ratio:</span>
                    <span className="text-[#1A1A1A] print:text-black font-bold">{hyperStats.staffPaid} / {hyperStats.staffTotal} staff</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Combined totals bar */}
          <section>
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              3. Aggregate Financial Metrics
            </h2>
            <div className="bg-[#F8F8F8] border border-[#E8E8E8] rounded-lg p-4 space-y-2.5 text-xs font-semibold text-[#555555] print:bg-gray-50 print:border-gray-150 print:text-gray-700 font-sans">
              <div className="flex justify-between items-center">
                <span>Combined Base Salaries:</span>
                <span className="text-[#1A1A1A] print:text-black font-bold">{formatCurrency(totalBase)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Combined OT Earnings:</span>
                <span className="text-[var(--success)] print:text-green-700 font-bold">+{formatCurrency(totalOT)}</span>
              </div>
              <div className="flex justify-between items-center pb-2.5 border-b border-[#E8E8E8] print:border-gray-200">
                <span>Combined Leave Deductions:</span>
                <span className="text-[var(--danger)] print:text-red-700 font-bold">-{formatCurrency(totalDed)}</span>
              </div>
              <div className="flex justify-between items-end pt-1">
                <span className="text-[10px] font-bold uppercase text-[#1A1A1A] print:text-black tracking-widest">
                  Total Net Payroll
                </span>
                <span className="text-xl font-bold text-[#1A1A1A] print:text-black">
                  {formatCurrency(netPayroll)}
                </span>
              </div>
            </div>
          </section>

          {/* Staff table registry */}
          <section className="overflow-x-auto">
            <h2 className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider mb-2.5">
              4. Complete Staff Registry list
            </h2>
            <table className="w-full text-left text-xs whitespace-nowrap border-collapse">
              <thead>
                <tr className="text-[var(--text-muted)] print:text-gray-500 uppercase font-bold text-[9px] bg-[#F8F8F8] border-b border-[#E8E8E8] print:bg-gray-50 print:border-gray-200">
                  <th className="p-2">Name</th>
                  <th className="p-2">Branch</th>
                  <th className="p-2 text-right">Base</th>
                  <th className="p-2 text-right">OT</th>
                  <th className="p-2 text-right">Ded.</th>
                  <th className="p-2 text-right font-bold text-[#1A1A1A] print:text-black">Net</th>
                  <th className="p-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E8E8] print:divide-gray-100">
                {reportRecords.map((conf) => {
                  const s = staffList.find((x) => x.id === conf.staff_id);
                  if (!s) return null;
                  const isPaid = payments.find((p) => p.staff_id === conf.staff_id);
                  
                  return (
                    <tr key={conf.id || conf.staff_id} className="hover:bg-[#F8F8F8] print:hover:bg-gray-50 transition-colors">
                      <td className="p-2 font-bold text-[#1A1A1A] print:text-black">{s.name}</td>
                      <td className="p-2 text-[#555555] print:text-gray-500 capitalize">{s.branch_id}</td>
                      <td className="p-2 text-right font-semibold text-[#1A1A1A] print:text-black">{formatCurrency(conf.base_salary)}</td>
                      <td className="p-2 text-right text-[var(--success)] print:text-green-700 font-semibold">+{formatCurrency(conf.ot_pay)}</td>
                      <td className="p-2 text-right text-[var(--danger)] print:text-red-700 font-semibold">-{formatCurrency(conf.leave_deduction)}</td>
                      <td className="p-2 text-right font-bold text-[#1A1A1A] print:text-black">{formatCurrency(conf.net_salary)}</td>
                      <td className="p-2 text-center font-bold">
                        {confirmations.length > 0 ? (
                          isPaid ? (
                            <span className="bg-[var(--success-bg)] text-[var(--success)] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[var(--success)]/20 print:bg-green-50 print:text-green-700 print:border-green-150">
                              Paid
                            </span>
                          ) : (
                            <span className="bg-[var(--warning-bg)] text-[var(--warning)] text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-[var(--warning)]/20 print:bg-amber-50 print:text-[#E65100] print:border-amber-150">
                              Pending
                            </span>
                          )
                        ) : (
                          <span className="bg-red-100 text-red-700 text-[8px] font-bold px-2 py-0.5 rounded uppercase border border-red-200">
                            PENDING — NOT CONFIRMED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {reportRecords.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[var(--text-muted)] print:text-gray-400 italic font-semibold">
                      No records generated for this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
