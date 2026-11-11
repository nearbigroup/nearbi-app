'use client';

import React, { useState, useMemo } from 'react';
import {
  StaffGridRow,
  DayCellData,
  InTimeGridModel,
  sortStaffRows,
} from '@/lib/inTimeGrid';
import {
  Calendar,
  Filter,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight,
  X,
  User,
  Building,
  ArrowUpDown,
  Shield,
} from 'lucide-react';

interface InTimeGridProps {
  model: InTimeGridModel;
  selectedMonth: string; // YYYY-MM
  onMonthChange: (newMonth: string) => void;
  allowedBranch?: string | null;
  allowedDepartment?: string | null;
  isLoading?: boolean;
}

export default function InTimeGrid({
  model,
  selectedMonth,
  onMonthChange,
  allowedBranch,
  allowedDepartment,
  isLoading = false,
}: InTimeGridProps) {
  const [branchFilter, setBranchFilter] = useState<string>(allowedBranch || 'all');
  const [deptFilter, setDeptFilter] = useState<string>(allowedDepartment || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'place' | 'name'>('place');

  // Staff selected for Slide-over Panel (Desktop) or Bottom Sheet (Mobile)
  const [selectedStaff, setSelectedStaff] = useState<StaffGridRow | null>(null);

  // Single Day Punch Detail Modal
  const [selectedCell, setSelectedCell] = useState<{
    staff: StaffGridRow;
    cell: DayCellData;
  } | null>(null);

  // Filtered rows for the grid
  const filteredRows = useMemo(() => {
    const list = model.rows.filter((row) => {
      // Branch filter
      if (allowedBranch && row.branchId !== allowedBranch) return false;
      if (branchFilter !== 'all' && row.branchId !== branchFilter) return false;

      // Department filter
      if (allowedDepartment && row.department !== allowedDepartment) return false;
      if (deptFilter !== 'all' && row.department !== deptFilter) return false;

      // Name search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!row.name.toLowerCase().includes(q)) return false;
      }

      return true;
    });

    return sortStaffRows(list, sortBy);
  }, [model.rows, branchFilter, deptFilter, searchQuery, allowedBranch, allowedDepartment, sortBy]);

  // Keep selectedStaff up-to-date with filtered rows if month or filter changes
  const activeStaffDetail = useMemo(() => {
    if (!selectedStaff) return null;
    return model.rows.find((r) => r.staffId === selectedStaff.staffId) || selectedStaff;
  }, [selectedStaff, model.rows]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(prevStr);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    onMonthChange(nextStr);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const dt = new Date(y, m - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Helper for desktop table cell background & text color
  const getCellClasses = (cell: DayCellData) => {
    if (cell.isHourly) {
      return 'bg-slate-800/60 border border-white/10 text-slate-200';
    }
    switch (cell.colorCode) {
      case 'green':
        return 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300';
      case 'yellow':
        return 'bg-amber-950/70 border border-amber-500/40 text-amber-300';
      case 'orange':
        return 'bg-orange-950/70 border border-orange-500/40 text-orange-300';
      case 'red':
        return 'bg-rose-950/70 border border-rose-500/40 text-rose-300';
      default:
        return 'bg-slate-800/60 border border-white/10 text-slate-200';
    }
  };

  // Helper for mobile dot color
  const getDotClasses = (cell: DayCellData) => {
    if (cell.hasPunch) {
      switch (cell.colorCode) {
        case 'green':
          return 'bg-emerald-400 shadow-sm shadow-emerald-500/30';
        case 'yellow':
          return 'bg-amber-400 shadow-sm shadow-amber-500/30';
        case 'orange':
          return 'bg-orange-400 shadow-sm shadow-orange-500/30';
        case 'red':
          return 'bg-rose-500 shadow-sm shadow-rose-500/30';
        default:
          return 'bg-slate-500';
      }
    }
    // Future or past approved leave
    if (cell.isApprovedLeave) {
      return 'bg-slate-700 ring-1 ring-emerald-400/80 text-emerald-300 font-bold';
    }
    // Future blank
    if (cell.isFuture) {
      return 'border border-white/15 bg-transparent';
    }
    // Past day with no punch
    return 'bg-slate-800/80 border border-white/5';
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Control Bar */}
      <div className="bg-[#161820] border border-white/10 rounded-2xl p-4 md:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          {/* Month selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevMonth}
              className="h-9 w-9 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95"
              title="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-black/40 border border-white/10 rounded-xl">
              <Calendar size={16} className="text-amber-400" />
              <span className="text-sm font-bold text-white tracking-wide">{monthLabel}</span>
            </div>
            <button
              onClick={handleNextMonth}
              className="h-9 w-9 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95"
              title="Next Month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Filters: Branch, Department, Search, Sort Toggle */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            {/* Sort Toggle Button */}
            <button
              onClick={() => setSortBy(sortBy === 'place' ? 'name' : 'place')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-black/40 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white active:scale-95"
              title="Toggle sorting between Rank / Place and Staff Name"
            >
              <ArrowUpDown size={14} className="text-amber-400" />
              <span>Sort: {sortBy === 'place' ? 'Place / Rank' : 'Name (A–Z)'}</span>
            </button>

            {/* Branch Filter */}
            {!allowedBranch && (
              <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-xl px-2.5 py-1">
                <Building size={14} className="text-slate-400" />
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer py-1"
                >
                  <option value="all" className="bg-[#1A1D26] text-white">All Branches</option>
                  <option value="daily" className="bg-[#1A1D26] text-white">Daily</option>
                  <option value="hypermarket" className="bg-[#1A1D26] text-white">Hypermarket</option>
                </select>
              </div>
            )}

            {/* Department Filter */}
            {!allowedDepartment && (
              <div className="flex items-center gap-1.5 bg-black/30 border border-white/10 rounded-xl px-2.5 py-1">
                <Filter size={14} className="text-slate-400" />
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer py-1"
                >
                  <option value="all" className="bg-[#1A1D26] text-white">All Depts</option>
                  {model.departments.map((dept) => (
                    <option key={dept} value={dept} className="bg-[#1A1D26] text-white">
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Input */}
            <div className="flex-1 sm:flex-none">
              <input
                type="text"
                placeholder="Search staff name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-44 bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 pt-3.5 mt-3.5 border-t border-white/5 text-[11px] text-slate-400">
          <span className="font-semibold text-slate-300">Legend:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <span>On Time (Green)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>1-15m Late (Yellow)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
            <span>16-30m Late (Orange)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>&gt;30m Late (Red)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-0.5">
              L <Check size={9} className="text-emerald-400 stroke-[3]" />
            </span>
            <span>Approved Leave</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-white/10"></span>
            <span>Past No Punch</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-dashed border-white/20"></span>
            <span>Future (Blank)</span>
          </span>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="bg-[#12141C] border border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center gap-2">
          <Clock className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-xs font-bold text-white uppercase tracking-wider">
            Loading attendance and fine records...
          </p>
        </div>
      )}

      {/* DESKTOP TABLE VIEW (Screens >= 768px) */}
      <div className="hidden md:block bg-[#12141C] border border-white/10 rounded-2xl shadow-2xl overflow-hidden relative">
        <div className="overflow-x-auto max-h-[74vh] overflow-y-auto relative scrollbar-thin scrollbar-thumb-white/10">
          <table className="w-full text-left border-collapse select-none">
            {/* Table Header */}
            <thead>
              <tr className="bg-[#181B26] border-b border-white/10 sticky top-0 z-20">
                {/* Sticky Left Column: Staff Info */}
                <th className="sticky left-0 z-30 bg-[#181B26] p-3 text-xs font-black uppercase text-slate-300 tracking-wider min-w-[240px] max-w-[260px] border-r border-white/10 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center justify-between">
                    <span>Staff Member</span>
                    <span className="text-[10px] text-slate-500 font-semibold lowercase">
                      ({filteredRows.length})
                    </span>
                  </div>
                </th>

                {/* Day Header Cells (1..calendarDays) */}
                {model.dayColumns.map((col) => (
                  <th
                    key={col.dayNumber}
                    className={`p-1.5 text-center min-w-[60px] max-w-[65px] border-r border-white/5 ${
                      col.isSunday ? 'bg-red-950/20' : ''
                    } ${col.isToday ? 'ring-1 ring-amber-400/40 bg-amber-950/10' : ''}`}
                  >
                    <div className="text-[11px] font-black text-white">{col.dayNumber}</div>
                    <div
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        col.isSunday ? 'text-red-400 font-black' : 'text-slate-500'
                      }`}
                    >
                      {col.dayOfWeek}
                    </div>
                  </th>
                ))}

                {/* Right Summary Columns */}
                <th className="p-2 text-center min-w-[42px] border-r border-white/10 text-[10px] font-black text-emerald-400 uppercase tracking-wider bg-[#181B26]" title="On-time green punches">
                  G
                </th>
                <th className="p-2 text-center min-w-[42px] border-r border-white/10 text-[10px] font-black text-amber-400 uppercase tracking-wider bg-[#181B26]" title="1-15 min late punches">
                  Y
                </th>
                <th className="p-2 text-center min-w-[42px] border-r border-white/10 text-[10px] font-black text-orange-400 uppercase tracking-wider bg-[#181B26]" title="16-30 min late punches">
                  O
                </th>
                <th className="p-2 text-center min-w-[42px] border-r border-white/10 text-[10px] font-black text-rose-400 uppercase tracking-wider bg-[#181B26]" title=">30 min late punches">
                  R
                </th>
                <th className="p-2 text-center min-w-[64px] border-r border-white/10 text-[10px] font-black text-slate-300 uppercase tracking-wider bg-[#181B26]" title="No-punch past days">
                  No-Punch
                </th>
                <th className="p-2 text-center min-w-[68px] border-r border-white/10 text-[10px] font-black text-slate-300 uppercase tracking-wider bg-[#181B26]" title="Weekly offs used">
                  Offs Used
                </th>
                <th className="p-2 text-center min-w-[56px] border-r border-white/10 text-[10px] font-black text-slate-300 uppercase tracking-wider bg-[#181B26]" title="Unpaid leave days">
                  Leave
                </th>
                <th className="p-2 text-center min-w-[56px] border-r border-white/10 text-[10px] font-black text-slate-300 uppercase tracking-wider bg-[#181B26]" title="Monthly target days">
                  Target
                </th>
                <th className="p-2 text-center min-w-[100px] border-r border-white/10 text-[10px] font-black text-slate-300 uppercase tracking-wider bg-[#181B26]">
                  Status
                </th>
                <th className="p-2 text-center min-w-[76px] border-r border-white/10 text-[10px] font-black text-amber-300 uppercase tracking-wider bg-[#181B26]" title="Fines issued (Rs)">
                  Fines (₹)
                </th>
                <th className="p-2 text-center min-w-[76px] border-r border-white/10 text-[10px] font-black text-sky-300 uppercase tracking-wider bg-[#181B26]" title="Fines waived (Rs)">
                  Waived (₹)
                </th>
                <th className="p-2 text-center min-w-[64px] text-[10px] font-black text-amber-400 uppercase tracking-wider bg-[#181B26]" title="Free passes left">
                  Passes
                </th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-white/5 text-xs">
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={model.calendarDays + 13}
                    className="p-12 text-center text-slate-500 text-xs font-bold italic"
                  >
                    No staff records found for this month with attendance punches.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.staffId}
                    className="hover:bg-white/[0.03] transition-colors group cursor-pointer"
                    onClick={() => setSelectedStaff(row)}
                  >
                    {/* Sticky Staff Info Cell */}
                    <td className="sticky left-0 z-10 bg-[#141620] group-hover:bg-[#181B26] p-2.5 border-r border-white/10 min-w-[240px] max-w-[260px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.5)] transition-colors">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-baseline justify-between gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {/* Place Badge */}
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black shrink-0 ${
                                row.place === 1
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : row.place !== null
                                  ? 'bg-white/10 text-slate-300 border border-white/10'
                                  : 'bg-black/30 text-slate-500 border border-white/5 text-[9px]'
                              }`}
                              title={row.place !== null ? `Rank #${row.place}` : 'Hourly / No Shift (Not ranked)'}
                            >
                              {row.place !== null ? `#${row.place}` : '—'}
                            </span>
                            <span className="text-xs font-bold text-white truncate" title={row.name}>
                              {row.name}
                            </span>
                          </div>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-bold bg-white/5 text-slate-400 shrink-0">
                            {row.branchId === 'daily' ? 'Daily' : 'Hyper'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="truncate max-w-[130px]" title={row.department}>
                            {row.department}
                          </span>
                          <span className="font-mono text-slate-500 text-[9px]">
                            {row.shiftLabel}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Day Cells */}
                    {model.dayColumns.map((col) => {
                      const cell = row.days[col.dayNumber];
                      if (!cell) {
                        return (
                          <td key={col.dayNumber} className="p-1 border-r border-white/5 text-center text-slate-700">
                            —
                          </td>
                        );
                      }

                      // Day with punch
                      if (cell.hasPunch) {
                        return (
                          <td
                            key={col.dayNumber}
                            className={`p-1 border-r border-white/5 text-center transition-all cursor-pointer hover:brightness-125 ${
                              col.isSunday ? 'bg-red-950/10' : ''
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell({ staff: row, cell });
                            }}
                          >
                            <div
                              className={`rounded-lg py-1 px-0.5 flex flex-col items-center justify-center transition-all shadow-sm ${getCellClasses(
                                cell
                              )}`}
                            >
                              {/* IN time */}
                              <span className="text-[10px] font-black leading-tight tracking-tight">
                                {cell.formattedIn}
                              </span>
                              {/* OUT time small uncolored */}
                              <span className="text-[8.5px] font-medium text-slate-400 leading-tight mt-0.5">
                                {cell.formattedOut}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      // FIX 2: Approved leave (both past and future!)
                      if (cell.isApprovedLeave) {
                        return (
                          <td
                            key={col.dayNumber}
                            className={`p-1 border-r border-white/5 text-center ${
                              col.isSunday ? 'bg-red-950/10' : ''
                            }`}
                          >
                            <div
                              className="rounded-lg py-1 px-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 font-black text-[9px] flex items-center justify-center gap-0.5 shadow-sm"
                              title="Approved Leave"
                            >
                              <span>L</span>
                              <Check size={10} className="text-emerald-400 stroke-[3]" />
                            </div>
                          </td>
                        );
                      }

                      // Future day without punch or leave: stays blank
                      if (cell.isFuture) {
                        return (
                          <td
                            key={col.dayNumber}
                            className={`p-1 border-r border-white/5 text-center ${
                              col.isSunday ? 'bg-red-950/5' : ''
                            }`}
                          >
                            <div className="h-7 w-full"></div>
                          </td>
                        );
                      }

                      // Past day with no punch
                      return (
                        <td
                          key={col.dayNumber}
                          className={`p-1 border-r border-white/5 text-center ${
                            col.isSunday ? 'bg-red-950/10' : ''
                          }`}
                        >
                          <div
                            className="rounded-lg h-7 bg-slate-800/40 border border-white/5 flex items-center justify-center text-[9px] text-slate-600 font-bold"
                            title="No Punch"
                          >
                            —
                          </div>
                        </td>
                      );
                    })}

                    {/* Right Summary Columns */}
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-black text-emerald-400">
                      {row.counts.green}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-black text-amber-400">
                      {row.counts.yellow}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-black text-orange-400">
                      {row.counts.orange}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-black text-rose-400">
                      {row.counts.red}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono text-slate-400 font-bold">
                      {row.noPunchPastDays}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono text-slate-400 font-bold">
                      {row.weeklyOffsUsed}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono text-slate-400 font-bold">
                      {row.leaveDays}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-bold text-white">
                      {!row.hasShift ? '—' : row.targetDays}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10">
                      <div className="flex flex-col items-center justify-center gap-0.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight whitespace-nowrap ${
                            row.statusBadge === 'FULL TARGET' || row.statusBadge === 'ON TRACK'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                              : row.statusBadge === 'NO SHIFT SET'
                              ? 'bg-slate-800 text-slate-400 border border-slate-700/50'
                              : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {row.statusBadge}
                        </span>
                        {row.isCurrentMonth && row.progressText && row.hasShift && (
                          <span className="text-[8.5px] font-mono text-slate-400 font-semibold whitespace-nowrap">
                            {row.progressText}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-bold text-amber-300">
                      ₹{row.finesIssued}
                    </td>
                    <td className="p-1.5 text-center border-r border-white/10 font-mono font-bold text-sky-300">
                      ₹{row.finesWaived}
                    </td>
                    <td className="p-1.5 text-center font-mono font-black text-amber-400">
                      {row.freePassesLeft}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE COMPACT CARDS VIEW (Screens < 768px) */}
      <div className="block md:hidden space-y-3.5">
        {filteredRows.length === 0 ? (
          <div className="bg-[#12141C] border border-white/10 rounded-2xl p-8 text-center text-slate-500 text-xs font-bold italic">
            No staff records found for this month with attendance punches.
          </div>
        ) : (
          filteredRows.map((row) => (
            <div
              key={row.staffId}
              onClick={() => setSelectedStaff(row)}
              className="bg-[#141620] border border-white/10 hover:border-white/20 rounded-2xl p-3.5 shadow-lg space-y-3 cursor-pointer transition-all active:scale-[0.99]"
            >
              {/* Card Header: Name, Rank, Shift, Status */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black shrink-0 ${
                        row.place === 1
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : row.place !== null
                          ? 'bg-white/10 text-slate-300 border border-white/10'
                          : 'bg-black/30 text-slate-500 border border-white/5 text-[9px]'
                      }`}
                    >
                      {row.place !== null ? `#${row.place}` : 'Unranked'}
                    </span>
                    <h4 className="text-sm font-bold text-white truncate">{row.name}</h4>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {row.branchId === 'daily' ? 'Daily' : 'Hyper'} • {row.department} •{' '}
                    <span className="font-mono text-slate-500">{row.shiftLabel}</span>
                  </p>
                </div>

                {/* Status Badge */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[9.5px] font-black uppercase tracking-tight ${
                      row.statusBadge === 'FULL TARGET' || row.statusBadge === 'ON TRACK'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        : row.statusBadge === 'NO SHIFT SET'
                        ? 'bg-slate-800 text-slate-400 border border-slate-700/50'
                        : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {row.statusBadge}
                  </span>
                  {row.isCurrentMonth && row.progressText && row.hasShift && (
                    <span className="text-[9px] font-mono text-slate-400 font-semibold">
                      {row.progressText}
                    </span>
                  )}
                </div>
              </div>

              {/* Compact Strip of 28-31 Colored Dots */}
              <div className="bg-black/40 border border-white/5 rounded-xl p-2.5">
                <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold mb-1.5 px-0.5">
                  <span>Day 1</span>
                  <span>Days of Month</span>
                  <span>Day {model.calendarDays}</span>
                </div>
                <div className="grid grid-cols-11 sm:grid-cols-16 gap-1.5">
                  {model.dayColumns.map((col) => {
                    const cell = row.days[col.dayNumber];
                    if (!cell) return null;
                    return (
                      <button
                        key={col.dayNumber}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (cell.hasPunch) {
                            setSelectedCell({ staff: row, cell });
                          }
                        }}
                        className={`h-4 rounded-md flex items-center justify-center text-[7.5px] font-bold transition-all ${getDotClasses(
                          cell
                        )} ${cell.hasPunch ? 'cursor-pointer active:scale-90 text-black font-black' : ''}`}
                        title={`Day ${col.dayNumber}: ${
                          cell.hasPunch
                            ? `${cell.formattedIn} - ${cell.formattedOut} (${cell.colorCode})`
                            : cell.isApprovedLeave
                            ? 'Approved Leave'
                            : cell.isFuture
                            ? 'Future'
                            : 'No Punch'
                        }`}
                      >
                        {cell.isApprovedLeave ? 'L' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary Numbers Row: Green / Late / Leave / Fines */}
              <div className="grid grid-cols-4 gap-2 pt-1 border-t border-white/5 text-center">
                <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-lg p-1.5">
                  <div className="text-[9px] text-emerald-400 font-bold uppercase">On Time</div>
                  <div className="text-xs font-black text-emerald-300 font-mono">
                    {row.counts.green}
                  </div>
                </div>
                <div className="bg-amber-950/30 border border-amber-500/20 rounded-lg p-1.5">
                  <div className="text-[9px] text-amber-400 font-bold uppercase">Late</div>
                  <div className="text-xs font-black text-amber-300 font-mono">
                    {row.counts.yellow + row.counts.orange + row.counts.red}
                  </div>
                </div>
                <div className="bg-slate-800/40 border border-white/10 rounded-lg p-1.5">
                  <div className="text-[9px] text-slate-400 font-bold uppercase">Leave</div>
                  <div className="text-xs font-black text-white font-mono">
                    {row.leaveDays}d
                  </div>
                </div>
                <div className="bg-rose-950/30 border border-rose-500/20 rounded-lg p-1.5">
                  <div className="text-[9px] text-rose-400 font-bold uppercase">Fines</div>
                  <div className="text-xs font-black text-rose-300 font-mono">
                    ₹{row.finesIssued}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* STAFF SIDE-OVER PANEL (Desktop) / BOTTOM SHEET (Phone) */}
      {activeStaffDetail && (
        <div className="fixed inset-0 z-50 flex justify-end md:items-stretch items-end bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          {/* Backdrop Click */}
          <div
            className="absolute inset-0"
            onClick={() => setSelectedStaff(null)}
          ></div>

          {/* Panel Container: Desktop slide-over on right, Phone bottom sheet */}
          <div className="relative w-full md:max-w-md bg-[#161820] border-t md:border-t-0 md:border-l border-white/15 rounded-t-3xl md:rounded-none max-h-[88vh] md:max-h-full overflow-y-auto shadow-2xl p-5 md:p-6 space-y-5 z-10 scrollbar-thin scrollbar-thumb-white/10">
            {/* Header: Name, Shift, Off Days, Target, Status, Place */}
            <div className="flex items-start justify-between pb-4 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-black ${
                      activeStaffDetail.place === 1
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : activeStaffDetail.place !== null
                        ? 'bg-white/10 text-slate-300 border border-white/10'
                        : 'bg-black/30 text-slate-500 border border-white/5 text-[10px]'
                    }`}
                  >
                    {activeStaffDetail.place !== null
                      ? `Rank #${activeStaffDetail.place}`
                      : 'No Shift / Unranked'}
                  </span>
                  <h3 className="text-lg font-black text-white tracking-tight">
                    {activeStaffDetail.name}
                  </h3>
                </div>

                <p className="text-xs text-slate-400 font-medium mt-1">
                  {activeStaffDetail.branchId === 'daily' ? 'Daily' : 'Hyper'} •{' '}
                  {activeStaffDetail.department}
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-300">
                  <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono">
                    Shift: {activeStaffDetail.shiftLabel}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono">
                    Offs: {activeStaffDetail.offDaysPerMonth}d/mo
                  </span>
                  {activeStaffDetail.hasShift && (
                    <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10 font-mono">
                      Target: {activeStaffDetail.targetDays}d
                    </span>
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wide inline-block ${
                      activeStaffDetail.statusBadge === 'FULL TARGET' || activeStaffDetail.statusBadge === 'ON TRACK'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                        : activeStaffDetail.statusBadge === 'NO SHIFT SET'
                        ? 'bg-slate-800 text-slate-400 border border-slate-700/50'
                        : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {activeStaffDetail.statusBadge}
                  </span>
                  {activeStaffDetail.isCurrentMonth && activeStaffDetail.progressText && activeStaffDetail.hasShift && (
                    <span className="text-xs font-mono text-slate-300 font-bold">
                      {activeStaffDetail.progressText}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedStaff(null)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-all active:scale-95"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Summary Numbers Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Monthly Attendance Breakdown
              </h4>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block">Green</span>
                  <span className="text-base font-black text-emerald-300 font-mono">
                    {activeStaffDetail.counts.green}
                  </span>
                </div>
                <div className="bg-amber-950/40 border border-amber-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] font-bold text-amber-400 uppercase block">Yellow</span>
                  <span className="text-base font-black text-amber-300 font-mono">
                    {activeStaffDetail.counts.yellow}
                  </span>
                </div>
                <div className="bg-orange-950/40 border border-orange-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] font-bold text-orange-400 uppercase block">Orange</span>
                  <span className="text-base font-black text-orange-300 font-mono">
                    {activeStaffDetail.counts.orange}
                  </span>
                </div>
                <div className="bg-rose-950/40 border border-rose-500/20 rounded-xl p-2.5 text-center">
                  <span className="text-[10px] font-bold text-rose-400 uppercase block">Red</span>
                  <span className="text-base font-black text-rose-300 font-mono">
                    {activeStaffDetail.counts.red}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">No-Punch</span>
                  <span className="text-sm font-black text-white font-mono">
                    {activeStaffDetail.noPunchPastDays}d
                  </span>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Offs Used</span>
                  <span className="text-sm font-black text-white font-mono">
                    {activeStaffDetail.weeklyOffsUsed}d
                  </span>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Leave Days</span>
                  <span className="text-sm font-black text-white font-mono">
                    {activeStaffDetail.leaveDays}d
                  </span>
                </div>
              </div>

              {activeStaffDetail.approvedLeaveDays > 0 && (
                <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-2 flex items-center justify-between text-xs px-3">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Check size={14} className="text-emerald-400 stroke-[3]" />
                    Approved Leave Days (Whole Month):
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {activeStaffDetail.approvedLeaveDays}d
                  </span>
                </div>
              )}
            </div>

            {/* Fines Section */}
            <div className="space-y-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Late Fines &amp; Passes
                </h4>
                {activeStaffDetail.isExempt && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-full">
                    <Shield size={10} />
                    Fine Exempt
                  </span>
                )}
              </div>

              {/* Exact Rule Banner */}
              <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-2.5 text-[11px] text-amber-200/90 leading-relaxed font-medium">
                Yellow Rs 20 (4 free), Orange Rs 30, Red Rs 50 - amounts stored when each fine was created
              </div>

              {/* Fines Totals Bar */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Issued</span>
                  <span className="text-sm font-black text-amber-300 font-mono">
                    ₹{activeStaffDetail.finesIssued}
                  </span>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Waived</span>
                  <span className="text-sm font-black text-sky-300 font-mono">
                    ₹{activeStaffDetail.finesWaived}
                  </span>
                </div>
                <div className="bg-black/30 border border-white/5 rounded-xl p-2">
                  <span className="text-[10px] text-slate-400 block font-semibold">Passes Left</span>
                  <span className="text-sm font-black text-emerald-300 font-mono">
                    {activeStaffDetail.freePassesLeft} / {model.fineSettings.yellow_free_passes}
                  </span>
                </div>
              </div>

              {/* Chronological List of Every Late Day */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                <div className="text-[11px] font-bold text-slate-400">
                  Late Days ({activeStaffDetail.lateDayDetails.length}):
                </div>
                {activeStaffDetail.lateDayDetails.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-3 text-center bg-black/20 rounded-xl border border-white/5">
                    No late check-ins recorded for this month.
                  </p>
                ) : (
                  activeStaffDetail.lateDayDetails.map((ld) => {
                    const dt = new Date(ld.date + 'T00:00:00');
                    const dateFormatted = dt.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      weekday: 'short',
                    });

                    return (
                      <div
                        key={ld.date}
                        className="bg-black/30 border border-white/5 rounded-xl p-2.5 flex items-center justify-between text-xs hover:border-white/20 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              ld.colorCode === 'yellow'
                                ? 'bg-amber-400'
                                : ld.colorCode === 'orange'
                                ? 'bg-orange-400'
                                : 'bg-rose-500'
                            }`}
                          ></span>
                          <div>
                            <p className="font-bold font-mono text-white text-[11px]">
                              {dateFormatted}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              +{ld.minutesLate} mins late ({ld.colorCode})
                            </p>
                          </div>
                        </div>

                        {/* Status / Charge text */}
                        <div className="text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold inline-block ${
                              ld.isFreePass
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30 font-mono'
                                : ld.isWaived
                                ? 'bg-sky-950 text-sky-400 border border-sky-500/30'
                                : ld.isExempt
                                ? 'bg-slate-800 text-slate-300'
                                : 'bg-rose-950 text-rose-300 border border-rose-500/30 font-mono'
                            }`}
                          >
                            {ld.statusText}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              onClick={() => setSelectedStaff(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-all active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* SINGLE DAY CELL DETAIL POPUP */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1A1D28] border border-white/20 rounded-2xl max-w-sm w-full p-5 shadow-2xl text-white space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <User size={16} className="text-amber-400" />
                <h4 className="font-bold text-sm text-white">{selectedCell.staff.name}</h4>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Date:</span>
                <span className="font-bold font-mono text-white">
                  {new Date(selectedCell.cell.date + 'T00:00:00').toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    weekday: 'short',
                  })}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Scheduled Shift:</span>
                <span className="font-mono text-slate-300">
                  {selectedCell.staff.shiftStart
                    ? `${selectedCell.staff.shiftStart} – ${selectedCell.staff.shiftEnd}`
                    : selectedCell.staff.shiftLabel}
                </span>
              </div>

              {selectedCell.cell.overrideShiftStart && (
                <div className="flex justify-between py-1 border-b border-white/5 bg-sky-950/30 px-2 rounded">
                  <span className="text-sky-300 font-bold">Override Shift Start:</span>
                  <span className="font-mono text-sky-200">
                    {selectedCell.cell.overrideShiftStart}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Punch IN:</span>
                <span className="font-bold font-mono text-white">
                  {selectedCell.cell.formattedIn || 'None'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Punch OUT:</span>
                <span className="font-bold font-mono text-white">
                  {selectedCell.cell.formattedOut || 'None'}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Minutes Late:</span>
                <span className="font-bold font-mono text-white">
                  {selectedCell.cell.isHourly
                    ? '0 (Hourly)'
                    : `${selectedCell.cell.minutesLate} mins`}
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-slate-400">Lateness Band:</span>
                <span
                  className={`font-black uppercase px-2 py-0.5 rounded text-[10px] ${
                    selectedCell.cell.isHourly
                      ? 'bg-slate-800 text-slate-300'
                      : selectedCell.cell.colorCode === 'green'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                      : selectedCell.cell.colorCode === 'yellow'
                      ? 'bg-amber-950 text-amber-400 border border-amber-500/30'
                      : selectedCell.cell.colorCode === 'orange'
                      ? 'bg-orange-950 text-orange-400 border border-orange-500/30'
                      : selectedCell.cell.colorCode === 'red'
                      ? 'bg-rose-950 text-rose-400 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {selectedCell.cell.isHourly
                    ? 'Hourly'
                    : selectedCell.cell.colorCode
                    ? `${selectedCell.cell.colorCode}`
                    : 'Uncolored'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedCell(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-all active:scale-95"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
