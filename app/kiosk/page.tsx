'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { useRouter } from 'next/navigation';
import { Check, LogOut, Camera, AlertCircle, UserCheck, Timer, AlertTriangle, Coffee, RotateCcw, CircleCheck } from 'lucide-react';
import { calculateOTMinutes, calculateActualHours, calculateActualHoursWithBreaks, calculateEarlyLeaveMinutes, calculateLateMinutes, autoCloseCheckouts } from '@/lib/salary';
import { formatTime12hr } from '@/lib/utils';


type KioskState = 'IDLE' | 'LOADING' | 'STAFF_FOUND' | 'CAMERA' | 'RESULT' | 'ERROR' | 'SHORT_ATTENDANCE_WARNING';
type FlowType = 'CHECK_IN' | 'CHECK_OUT' | null;

export default function KioskPage() {
  const { user, userBranch, logout } = useAuth();
  const router = useRouter();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [kioskState, setKioskState] = useState<KioskState>('IDLE');
  const [pin, setPin] = useState('');
  const [staff, setStaff] = useState<any>(null);
  const [loadedBreakSettings, setLoadedBreakSettings] = useState<any>(null);
  const [flow, setFlow] = useState<FlowType>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingCheckout, setPendingCheckout] = useState<any>(null);
  const [cameraError, setCameraError] = useState(false);
  const [stats, setStats] = useState({ checkedIn: 0, late: 0, checkedOut: 0, onBreak: 0 });
  const [effectiveBranch, setEffectiveBranch] = useState<string | null>(null);

  const [pendingAnnouncements, setPendingAnnouncements] = useState<any[]>([]);
  const [activeAnnouncement, setActiveAnnouncement] = useState<any>(null);

  const [resultData, setResultData] = useState<{
    status: 'green' | 'yellow' | 'orange' | 'red' | 'blue';
    title: React.ReactNode;
    message: React.ReactNode;
    details?: string;
    icon?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const branch = userBranch || localStorage.getItem('nearbi_branch');
    setEffectiveBranch(branch);
  }, [userBranch]);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      if (now.getSeconds() === 0) {
        autoCloseBreaks();
      }
    }, 1000);
    autoCloseBreaks();
    return () => clearInterval(timer);
  }, [effectiveBranch]);

  useEffect(() => {
    if (!effectiveBranch) return;
    autoCloseCheckouts(effectiveBranch);
    const interval = setInterval(() => {
      autoCloseCheckouts(effectiveBranch);
    }, 1800000); // 30 minutes
    return () => clearInterval(interval);
  }, [effectiveBranch]);

  // Try to ensure bucket exists on app startup
  // IMPORTANT: Create storage bucket manually
  // Go to Supabase Dashboard
  // → Storage → New bucket
  // → Name: attendance-photos
  // → Public: YES (toggle on)
  // → Save
  useEffect(() => {
    const ensureBucket = async () => {
      try {
        await supabase.storage.createBucket(
          'attendance-photos',
          { public: true }
        );
      } catch (e) {
        // Bucket already exists - that's fine
        console.log('Bucket ready');
      }
    };
    ensureBucket();
  }, []);

  // Fetch branch-isolated stats every 30 seconds
  const fetchStats = async () => {
    if (!effectiveBranch) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      const { data: branchStaffIds, error: staffErr } = await supabase
        .from('staff')
        .select('id')
        .eq('branch_id', effectiveBranch)
        .eq('active', true);

      if (staffErr) throw staffErr;
      const staffIds = branchStaffIds?.map(s => s.id) || [];

      if (staffIds.length === 0) {
        setStats({ checkedIn: 0, late: 0, checkedOut: 0, onBreak: 0 });
        return;
      }

      const { count: checkedInCount, error: ciErr } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .in('staff_id', staffIds)
        .not('check_in_time', 'is', null);

      if (ciErr) throw ciErr;

      const { count: lateCount, error: lateErr } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .in('staff_id', staffIds)
        .eq('status', 'late');

      if (lateErr) throw lateErr;

      const { count: checkedOutCount, error: coErr } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .in('staff_id', staffIds)
        .not('check_out_time', 'is', null);

      if (coErr) throw coErr;

      // Fetch open breaks count today
      const { count: onBreakCount, error: breakErr } = await supabase
        .from('break_logs')
        .select('*', { count: 'exact', head: true })
        .eq('date', todayStr)
        .is('break_end', null)
        .in('staff_id', staffIds);

      if (breakErr) throw breakErr;
      const onBreak = onBreakCount || 0;

      setStats({
        checkedIn: checkedInCount || 0,
        late: lateCount || 0,
        checkedOut: checkedOutCount || 0,
        onBreak
      });
    } catch (err) {
      console.error('Error fetching kiosk stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [effectiveBranch]);

  // Submit PIN automatic lookups
  useEffect(() => {
    if (pin.length === 4) {
      handleLookup(pin);
    }
  }, [pin]);

  const handleLookup = async (enteredPin: string) => {
    setKioskState('LOADING');
    try {
      if (!effectiveBranch) {
        throw new Error('Branch not set for kiosk');
      }

      // Find active staff member in the current branch with this PIN
      const { data, error } = await supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('pin', enteredPin)
        .eq('branch_id', effectiveBranch)
        .eq('active', true)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('PIN not found for this branch');
      }

      // Normalize shift object if it comes as an array or from alternate keys
      let normalizedShift = null;
      if (data.shift) {
        normalizedShift = Array.isArray(data.shift) ? data.shift[0] : data.shift;
      } else if (data.shifts) {
        normalizedShift = Array.isArray(data.shifts) ? data.shifts[0] : data.shifts;
      }
      data.shift = normalizedShift;

      // Fetch break settings for their branch
      const branchId = data.branch_id || 'daily';
      const { data: bSettings } = await supabase
        .from('break_settings')
        .select('*')
        .eq('branch_id', branchId)
        .maybeSingle();

      setLoadedBreakSettings(bSettings || {
        branch_id: branchId,
        morning_tea_duration: 10,
        morning_tea_start: '09:30',
        morning_tea_end: '11:30',
        morning_tea_enabled: true,
        food_break_duration: 25,
        food_break_start: '12:00',
        food_break_end: '15:00',
        food_break_enabled: true,
        evening_tea_duration: 10,
        evening_tea_start: '16:00',
        evening_tea_end: '18:30',
        evening_tea_enabled: true,
      });

      setStaff(data);
      setKioskState('STAFF_FOUND');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'PIN not recognised');
      setKioskState('ERROR');
      setTimeout(() => {
        setPin('');
        setKioskState('IDLE');
      }, 2500);
    }
  };

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const resetKiosk = () => {
    stopCamera();
    setPin('');
    setStaff(null);
    setFlow(null);
    setResultData(null);
    setCameraError(false);
    setKioskState('IDLE');
  };

  const handleConfirmSignOut = async () => {
    try {
      logout();
      localStorage.clear();
      router.push('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const startCamera = async (type: FlowType) => {
    if (type === 'CHECK_IN' && staff && staff.pay_type !== 'hourly') {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const shiftStart = staff.shift?.start_time || staff.shifts?.start_time || '09:00';
      const shiftEnd = staff.shift?.end_time || staff.shifts?.end_time || '18:00';
      const [shH, shM] = shiftStart.split(':').map(Number);
      const [seH, seM] = shiftEnd.split(':').map(Number);
      
      let shiftEndToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), seH, seM, 0);
      if (seH * 60 + seM <= shH * 60 + shM) {
        shiftEndToday.setDate(shiftEndToday.getDate() + 1);
      }
      const blockTime = new Date(shiftEndToday.getTime() + 2 * 60 * 60 * 1000);
      
      if (now.getTime() > blockTime.getTime()) {
        const { data: record, error } = await supabase
          .from('attendance')
          .select('check_in_time')
          .eq('staff_id', staff.id)
          .eq('date', todayStr)
          .maybeSingle();
          
        if (!error && (!record || !record.check_in_time)) {
          setErrorMsg(`Check-in is blocked. Your shift ended at ${formatTime12hr(shiftEnd)}, and check-in is only allowed up to 2 hours after shift end.`);
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 5000);
          return;
        }
      }
    }

    setFlow(type);
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      setKioskState('CAMERA');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error('Camera access denied:', err);
      setCameraError(true);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const takePhotoBlob = (): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current) {
        reject(new Error('Video element not ready'));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Blob conversion failed'));
          }
        },
        'image/jpeg',
        0.85
      );
    });
  };

  const uploadPhoto = async (blob: Blob, filename: string): Promise<string> => {
    try {
      await supabase.storage.createBucket(
        'attendance-photos',
        { public: true }
      );
    } catch (e) {
      // Bucket already exists — fine
    }

    const { error: uploadError } = await supabase.storage
      .from('attendance-photos')
      .upload(filename, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('attendance-photos').getPublicUrl(filename);
    return data.publicUrl;
  };

  const saveCheckout = async (record: any, blob: Blob, now: Date, durationMins: number, isShortAttendance: boolean) => {
    setKioskState('LOADING');
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let photoUrl: string | null = null;
      let photoUploadFailed = false;
      try {
        const fileName = `${staff.id}/${todayStr}_checkout_${Date.now()}.jpg`;
        photoUrl = await uploadPhoto(blob, fileName);
      } catch (uploadErr) {
        console.error('Check-out photo upload failed:', uploadErr);
        photoUploadFailed = true;
      }

      const actualOut =
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0');

      const isHourly = staff.pay_type === 'hourly';
      const shiftStart = staff.shift?.start_time || staff.shifts?.start_time || '09:00';
      const shiftEnd = staff.shift?.end_time || staff.shifts?.end_time || '18:00';
      const otMins = isHourly ? 0 : calculateOTMinutes(shiftEnd, actualOut, shiftStart);
      const actualHrs = calculateActualHours(record.check_in_time, actualOut);
      const earlyLeaveMins = isHourly ? 0 : calculateEarlyLeaveMinutes(shiftEnd, actualOut, shiftStart);

      const isEarlyLeave = earlyLeaveMins > 0;
      const earlyLeaveMinutes = earlyLeaveMins;

      // Update attendance dynamically
      const checkoutRecord: any = {
        check_out_time: actualOut,
        ot_minutes: otMins,
        actual_hours_worked: actualHrs,
        early_leave_minutes: earlyLeaveMins,
        check_out_photo: photoUrl || null,
        short_attendance: isHourly ? false : isShortAttendance,
        total_hours_logged: isHourly ? actualHrs : 0
      };

      if (!isHourly && otMins > 0) {
        checkoutRecord.ot_approved = false; // pending approval
      }

      const { error: checkoutErr } = await supabase
        .from('attendance')
        .update(checkoutRecord)
        .eq('id', record.id);

      if (checkoutErr) {
        console.error('Check-out save error:', checkoutErr);
      }

      try {
        await supabase.from('wall_events').insert({
          event_type: 'check_out',
          staff_id: staff.id,
          staff_name: staff.name,
          branch_id: staff.branch_id,
          description: `${staff.name} checked out at ${actualOut} (${actualHrs}h worked)`
        });
      } catch (e) {
        console.error('Silent insert wall event failed:', e);
      }

      // Create OT adjustments and notifications if OT is > 0
      if (otMins > 0) {
        await supabase.from('attendance_adjustments').insert({
          staff_id: staff.id,
          date: todayStr,
          type: 'ot',
          minutes: otMins,
          status: 'pending',
        });

        await createNotification({
          type: 'ot_pending',
          title: 'OT Approval Required',
          message: `${staff.name} completed ${otMins}m Overtime.`,
          branchId: effectiveBranch,
          staffId: staff.id,
          relatedId: todayStr,
          targetRole: 'staff_executive',
        });
      }

      let resMsg = isHourly ? `Checked out — ${actualHrs.toFixed(2)} hrs logged today` : 'Checked out successfully!';
      let resDetails = '';

      if (otMins > 0) {
        const h = Math.floor(otMins / 60);
        const m = otMins % 60;
        resDetails = `OT pending approval: ${h > 0 ? h + 'h ' : ''}${m}m`;
      } else if (isEarlyLeave) {
        const h = Math.floor(earlyLeaveMinutes / 60);
        const m = earlyLeaveMinutes % 60;
        resDetails = `Left early: ${h > 0 ? h + 'h ' : ''}${m}m (deduction applies)`;
      }

      if (photoUploadFailed) {
        resDetails = resDetails 
          ? `${resDetails} | Check-out saved. Photo could not be uploaded.` 
          : 'Check-out saved. Photo could not be uploaded.';
      }

      // Check kiosk announcements
      let pending: any[] = [];
      try {
        const { data: announcements } = await supabase
          .from('staff_announcements')
          .select('*')
          .eq('show_on_kiosk', true)
          .or(`target.eq.all,target.eq.${staff.branch_id},target_staff_id.eq.${staff.id}`);

        const { data: reads } = await supabase
          .from('announcement_reads')
          .select('*')
          .eq('staff_id', staff.id);

        const readMap = new Map(reads?.map(r => [r.announcement_id, r]) || []);

        pending = announcements?.filter(a => {
          const read = readMap.get(a.id);
          if (!read) return true;
          if (read.read_on_kiosk) return false;
          if (a.is_important) {
            const createdTime = new Date(a.created_at).getTime();
            const hours = (now.getTime() - createdTime) / (1000 * 60 * 60);
            if (hours >= 24) return true;
          }
          return false;
        }) || [];
      } catch (e) {
        console.error('Failed to fetch kiosk announcements:', e);
      }

      setResultData({
        status: isShortAttendance ? 'orange' : 'blue',
        title: isShortAttendance ? 'SHORT ATTENDANCE' : 'CHECKED OUT',
        message: resMsg,
        details: resDetails,
      });

      setKioskState('RESULT');
      setTimeout(() => {
        if (pending.length > 0) {
          setPendingAnnouncements(pending);
          setActiveAnnouncement(pending[0]);
        } else {
          resetKiosk();
        }
        fetchStats();
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during submission.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const handleCapture = async () => {
    if (!staff || !flow) return;
    setKioskState('LOADING');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const blob = await takePhotoBlob();
      stopCamera();

      if (flow === 'CHECK_IN') {
        let photoUrl: string | null = null;
        let photoUploadFailed = false;
        try {
          const fileName = `${staff.id}/${todayStr}_checkin_${Date.now()}.jpg`;
          photoUrl = await uploadPhoto(blob, fileName);
        } catch (uploadErr) {
          console.error('Check-in photo upload failed:', uploadErr);
          photoUploadFailed = true;
        }

        const now = new Date();
        const checkInTimeStr = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"

        const isHourly = staff.pay_type === 'hourly';
        const shiftStartStr = staff.shift?.start_time || staff.shifts?.start_time || '09:00'; // "HH:MM"
        const [sh, sm] = shiftStartStr.split(':').map(Number);
        const shiftMins = sh * 60 + sm;
        const currentMins = now.getHours() * 60 + now.getMinutes();

        if (!isHourly) {
          // Block check-in if time > shift_end + 2 hours
          const shiftEndStr = staff.shift?.end_time || staff.shifts?.end_time || '18:00';
          const [seH, seM] = shiftEndStr.split(':').map(Number);
          
          let shiftEndToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), seH, seM, 0);
          if (seH * 60 + seM <= sh * 60 + sm) {
            shiftEndToday.setDate(shiftEndToday.getDate() + 1);
          }
          const blockTime = new Date(shiftEndToday.getTime() + 2 * 60 * 60 * 1000);
          
          if (now.getTime() > blockTime.getTime()) {
            setErrorMsg(`Check-in is blocked. Your shift ended at ${formatTime12hr(shiftEndStr)}, and check-in is only allowed up to 2 hours after shift end.`);
            setKioskState('ERROR');
            setTimeout(() => resetKiosk(), 5000);
            return;
          }
        }

        // Calculate early in
        let earlyInMinutes = 0;
        if (!isHourly) {
          const shiftStartMins = shiftMins;
          const checkInMins = currentMins;
          const earlyMins = Math.max(0, shiftStartMins - checkInMins);
          if (earlyMins > 0) {
            earlyInMinutes = earlyMins;
          }
        }

        // Calculate minutes late using calculateLateMinutes
        const minutesLate = isHourly ? 0 : calculateLateMinutes(checkInTimeStr, shiftStartStr);
        const lateMins = minutesLate; // late_salary_deduction_minutes
        let status: 'present' | 'late' = 'present';
        let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';

        if (!isHourly && minutesLate > 0) {
          status = 'late';
          
          if (minutesLate <= 15) {
            colorCode = 'yellow';
          } else if (minutesLate <= 30) {
            colorCode = 'orange';
          } else {
            colorCode = 'red';
          }
        }

        // Check fine exemptions
        const { data: exemption } = await supabase
          .from('staff_fine_exemptions')
          .select('id')
          .eq('staff_id', staff.id)
          .maybeSingle();

        const isExempt = !!exemption || isHourly;
        let fineAmount = 0;

        if (colorCode !== 'green' && !isExempt) {
          // Read fine settings
          const { data: fineSettings } = await supabase
            .from('fine_settings')
            .select('*')
            .limit(1)
            .maybeSingle();

          const settings = fineSettings || {
            yellow_fine: 50,
            orange_fine: 100,
            red_fine: 200,
            yellow_free_passes: 4
          };

          if (colorCode === 'yellow') {
            // Count yellow passes
            const startOfMonth = `${todayStr.substring(0, 8)}01`;
            const { count } = await supabase
              .from('attendance')
              .select('*', { count: 'exact', head: true })
              .eq('staff_id', staff.id)
              .eq('color_code', 'yellow')
              .gte('date', startOfMonth);

            const passesUsed = count || 0;
            if (passesUsed >= settings.yellow_free_passes) {
              fineAmount = Number(settings.yellow_fine);
            }
          } else if (colorCode === 'orange') {
            fineAmount = Number(settings.orange_fine);
          } else if (colorCode === 'red') {
            fineAmount = Number(settings.red_fine);
          }
        }

        const currentMonthStr = todayStr.substring(0, 7);

        // Upsert attendance record for check_in with late_salary_deduction_minutes
        const { error: upsertErr } = await supabase.from('attendance').upsert({
          staff_id: staff.id,
          date: todayStr,
          check_in_time: checkInTimeStr,
          status,
          color_code: colorCode,
          minutes_late: minutesLate,
          late_salary_deduction_minutes: lateMins,
          early_in_minutes: earlyInMinutes,
          check_in_photo: photoUrl || null,
          marked_by: 'kiosk',
        }, { onConflict: 'staff_id,date' });

        if (upsertErr) throw upsertErr;

        try {
          await supabase.from('wall_events').insert({
            event_type: 'check_in',
            staff_id: staff.id,
            staff_name: staff.name,
            branch_id: staff.branch_id,
            description: `${staff.name} checked in at ${checkInTimeStr} (${minutesLate > 0 ? minutesLate + 'm late' : 'on time'})`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }

        // Insert late fine if any
        if (fineAmount > 0) {
          await supabase.from('late_fines').upsert({
            staff_id: staff.id,
            date: todayStr,
            late_minutes: minutesLate,
            color_code: colorCode,
            fine_amount: fineAmount,
            waived: false,
            month: currentMonthStr,
          });

          // Insert notification for late_fine (ensure no money in msg for staff_executive)
          await createNotification({
            type: 'late_fine',
            title: 'Late Fine Incurred',
            message: `${staff.name} is ${minutesLate}m late (${colorCode} warning).`,
            branchId: effectiveBranch,
            staffId: staff.id,
            relatedId: todayStr,
            targetRole: 'staff_executive',
          });
        }

        // Insert notification if early check-in needs approval
        if (earlyInMinutes > 0) {
          await supabase.from('attendance_adjustments').insert({
            staff_id: staff.id,
            date: todayStr,
            type: 'early_in',
            minutes: earlyInMinutes,
            status: 'pending',
          });

          await createNotification({
            type: 'early_in_pending',
            title: 'Early Check-in Approval Required',
            message: `${staff.name} checked in ${earlyInMinutes}m early.`,
            branchId: effectiveBranch,
            staffId: staff.id,
            relatedId: todayStr,
            targetRole: 'staff_executive',
          });
        }

        // Set result screen parameters
        let resTitle: React.ReactNode = (
          <div className="flex flex-col items-center">
            <CircleCheck size={64} strokeWidth={1}
              style={{color:'#4ADE80', marginBottom:'12px'}} />
            <span>On Time</span>
          </div>
        );
        let resMsg = 'Have a great shift!';
        let resDetails = '';

        if (colorCode === 'yellow') {
          resTitle = <span style={{color:'#FBBF24'}}>{minutesLate} mins late — Yellow</span>;
          resMsg = fineAmount > 0 ? `Late arrival fine applied: ₹${fineAmount}` : 'Yellow free pass applied (no fine)';
        } else if (colorCode === 'orange') {
          resTitle = <span style={{color:'#FB923C'}}>{minutesLate} mins late — Orange</span>;
          resMsg = `Late arrival fine: ₹${fineAmount}`;
        } else if (colorCode === 'red') {
          resTitle = <span style={{color:'#F87171'}}>{minutesLate} mins late — Red</span>;
          resMsg = `Late arrival fine: ₹${fineAmount}`;
        }

        if (earlyInMinutes > 0) {
          resDetails = `Early In: ${earlyInMinutes} mins (Pending approval)`;
        }

        if (photoUploadFailed) {
          resDetails = resDetails 
            ? `${resDetails} | Check-in saved. Photo could not be uploaded.` 
            : 'Check-in saved. Photo could not be uploaded.';
        }

        // Check kiosk announcements
        let pending: any[] = [];
        try {
          const { data: announcements } = await supabase
            .from('staff_announcements')
            .select('*')
            .eq('show_on_kiosk', true)
            .or(`target.eq.all,target.eq.${staff.branch_id},target_staff_id.eq.${staff.id}`);

          const { data: reads } = await supabase
            .from('announcement_reads')
            .select('*')
            .eq('staff_id', staff.id);

          const readMap = new Map(reads?.map(r => [r.announcement_id, r]) || []);

          pending = announcements?.filter(a => {
            const read = readMap.get(a.id);
            if (!read) return true;
            if (read.read_on_kiosk) return false;
            if (a.is_important) {
              const createdTime = new Date(a.created_at).getTime();
              const hours = (now.getTime() - createdTime) / (1000 * 60 * 60);
              if (hours >= 24) return true;
            }
            return false;
          }) || [];
        } catch (e) {
          console.error('Failed to fetch kiosk announcements:', e);
        }

        setResultData({
          status: colorCode,
          title: resTitle,
          message: resMsg,
          details: resDetails,
        });

        setKioskState('RESULT');
        setTimeout(() => {
          if (pending.length > 0) {
            setPendingAnnouncements(pending);
            setActiveAnnouncement(pending[0]);
          } else {
            resetKiosk();
          }
          fetchStats();
        }, 4000);

      } else if (flow === 'CHECK_OUT') {
        const { data: record, error: recError } = await supabase
          .from('attendance')
          .select('*')
          .eq('staff_id', staff.id)
          .eq('date', todayStr)
          .maybeSingle();

        if (recError) throw recError;

        if (!record) {
          setErrorMsg("Haven't checked in today");
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        if (record.check_out_time) {
          setErrorMsg('Already checked out');
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        // Block checkout at the same time as check-in
        const nowForCheckout = new Date();
        const actualOutPreCheck =
          String(nowForCheckout.getHours()).padStart(2, '0') + ':' +
          String(nowForCheckout.getMinutes()).padStart(2, '0');
        if (actualOutPreCheck === record.check_in_time) {
          setErrorMsg('Invalid checkout. Try again.');
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        // Warn on short attendance (< 30 minutes)
        const [ciH, ciM] = record.check_in_time.split(':').map(Number);
        const ciTotalMins = ciH * 60 + ciM;
        const coTotalMins = nowForCheckout.getHours() * 60 + nowForCheckout.getMinutes();
        const durationMins = coTotalMins - ciTotalMins;

        if (durationMins > 0 && durationMins < 30) {
          setPendingCheckout({ record, blob, nowForCheckout, durationMins });
          setKioskState('SHORT_ATTENDANCE_WARNING');
        } else {
          await saveCheckout(record, blob, nowForCheckout, durationMins, false);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during submission.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const autoCloseBreaks = async () => {
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: openBreaks, error } = await supabase
        .from('break_logs')
        .select('*, staff:staff(*)')
        .eq('date', todayStr)
        .is('break_end', null);

      if (error) throw error;
      if (!openBreaks || openBreaks.length === 0) return;

      const now = new Date();
      for (const ob of openBreaks) {
        const start = new Date(ob.break_start);
        const diffMins = Math.max(0, Math.round((now.getTime() - start.getTime()) / (60 * 1000)));
        const threshold = ob.allowed_minutes + 30;
        if (diffMins > threshold) {
          const { error: updateErr } = await supabase
            .from('break_logs')
            .update({
              break_end: now.toISOString(),
              duration_minutes: diffMins,
              over_minutes: Math.max(0, diffMins - ob.allowed_minutes),
              auto_closed: true
            })
            .eq('id', ob.id);

          if (updateErr) throw updateErr;

          await createNotification({
            type: 'absent_alert',
            title: 'Break Auto-closed',
            message: `${ob.staff.name}'s break auto-closed after ${diffMins} mins.`,
            branchId: ob.staff.branch_id,
            staffId: ob.staff.id,
            relatedId: ob.id,
            targetRole: 'staff_executive'
          });

          try {
            await supabase.from('wall_events').insert({
              event_type: 'break_auto_closed',
              staff_id: ob.staff.id,
              staff_name: ob.staff.name,
              branch_id: ob.staff.branch_id,
              description: `${ob.staff.name} break auto-closed after ${diffMins} mins`
            });
          } catch (e) {
            console.error('Silent insert wall event failed:', e);
          }
        }
      }
    } catch (err) {
      console.error('Error auto closing breaks:', err);
    }
  };

  const handleBreakStart = async () => {
    if (!staff) return;
    setKioskState('LOADING');
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Check staff has checked in today
      const { data: attToday, error: attErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', todayStr)
        .maybeSingle();

      if (attErr) throw attErr;
      if (!attToday || !attToday.check_in_time) {
        setResultData({
          status: 'red',
          icon: 'alert-triangle',
          title: 'Check In Required',
          message: 'Please check in first'
        });
        setKioskState('RESULT');
        setTimeout(() => resetKiosk(), 4000);
        return;
      }

      // 2. Check no active break exists
      const { data: activeBreak, error: breakErr } = await supabase
        .from('break_logs')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', todayStr)
        .is('break_end', null)
        .maybeSingle();

      if (breakErr) throw breakErr;
      if (activeBreak) {
        setResultData({
          status: 'red',
          icon: 'alert-triangle',
          title: 'Already on Break',
          message: 'Already on break'
        });
        setKioskState('RESULT');
        setTimeout(() => resetKiosk(), 4000);
        return;
      }

      // 3. Fetch break_settings from Supabase for this branch
      const branchId = staff.branch_id || 'daily';
      const { data: breakSettings, error: settingsErr } = await supabase
        .from('break_settings')
        .select('*')
        .eq('branch_id', branchId)
        .maybeSingle();

      if (settingsErr) throw settingsErr;
      
      const settings = breakSettings || {
        branch_id: branchId,
        morning_tea_duration: 10,
        morning_tea_start: '09:30',
        morning_tea_end: '11:30',
        morning_tea_enabled: true,
        food_break_duration: 25,
        food_break_start: '12:00',
        food_break_end: '15:00',
        food_break_enabled: true,
        evening_tea_duration: 10,
        evening_tea_start: '16:00',
        evening_tea_end: '18:30',
        evening_tea_enabled: true,
      };

      // 4. Determine break type by current time
      const now = new Date();
      const current_time_mins = now.getHours() * 60 + now.getMinutes();

      const parseTimeToMins = (tStr: string) => {
        const [h, m] = tStr.split(':').map(Number);
        return h * 60 + m;
      };

      const morning_start = parseTimeToMins(settings.morning_tea_start);
      const morning_end = parseTimeToMins(settings.morning_tea_end);
      const food_start = parseTimeToMins(settings.food_break_start);
      const food_end = parseTimeToMins(settings.food_break_end);
      const evening_start = parseTimeToMins(settings.evening_tea_start);
      const evening_end = parseTimeToMins(settings.evening_tea_end);

      let break_type: 'morning_tea' | 'food_break' | 'evening_tea' | 'unscheduled' = 'unscheduled';
      let allowed = 15;
      let breakLabel = 'Unscheduled';

      if (current_time_mins >= morning_start && current_time_mins <= morning_end) {
        if (settings.morning_tea_enabled === false) {
          setResultData({
            status: 'red',
            icon: 'alert-triangle',
            title: 'Break Disabled',
            message: 'Morning Tea break is disabled for this branch.'
          });
          setKioskState('RESULT');
          setTimeout(() => resetKiosk(), 4000);
          return;
        }
        break_type = 'morning_tea';
        allowed = settings.morning_tea_duration;
        breakLabel = 'Morning Tea';
      } else if (current_time_mins >= food_start && current_time_mins <= food_end) {
        if (settings.food_break_enabled === false) {
          setResultData({
            status: 'red',
            icon: 'alert-triangle',
            title: 'Break Disabled',
            message: 'Food Break is disabled for this branch.'
          });
          setKioskState('RESULT');
          setTimeout(() => resetKiosk(), 4000);
          return;
        }
        break_type = 'food_break';
        allowed = settings.food_break_duration;
        breakLabel = 'Food Break';
      } else if (current_time_mins >= evening_start && current_time_mins <= evening_end) {
        if (settings.evening_tea_enabled === false) {
          setResultData({
            status: 'red',
            icon: 'alert-triangle',
            title: 'Break Disabled',
            message: 'Evening Tea break is disabled for this branch.'
          });
          setKioskState('RESULT');
          setTimeout(() => resetKiosk(), 4000);
          return;
        }
        break_type = 'evening_tea';
        allowed = settings.evening_tea_duration;
        breakLabel = 'Evening Tea';
      }

      // 5. Insert into break_logs
      const { error: insertBreakErr } = await supabase.from('break_logs').insert({
        staff_id: staff.id,
        date: todayStr,
        break_type,
        break_start: now.toISOString(),
        allowed_minutes: allowed
      });
      if (insertBreakErr) throw insertBreakErr;

      // 6. Insert wall_event
      try {
        await supabase.from('wall_events').insert({
          event_type: 'break_start',
          staff_id: staff.id,
          staff_name: staff.name,
          branch_id: staff.branch_id,
          description: `${staff.name} started ${breakLabel}`
        });
      } catch (e) {
        console.error('Silent insert wall event failed:', e);
      }

      // 7. Show amber overlay
      setResultData({
        status: 'yellow',
        icon: 'coffee',
        title: 'Break Started',
        message: `You have ${allowed} minutes`,
        details: `Break type: ${breakLabel}`,
      });
      setKioskState('RESULT');
      setTimeout(() => {
        resetKiosk();
        fetchStats();
      }, 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error starting break.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const handleBreakEnd = async () => {
    if (!staff) return;
    setKioskState('LOADING');
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Find open break_log
      const { data: openBreak, error: openBreakErr } = await supabase
        .from('break_logs')
        .select('*')
        .eq('staff_id', staff.id)
        .eq('date', todayStr)
        .is('break_end', null)
        .maybeSingle();

      if (openBreakErr) throw openBreakErr;
      if (!openBreak) {
        setResultData({
          status: 'red',
          icon: 'alert-triangle',
          title: 'No Active Break',
          message: 'No active break found'
        });
        setKioskState('RESULT');
        setTimeout(() => resetKiosk(), 4000);
        return;
      }

      // 2. Calculate duration and overstay
      const now = new Date();
      const start = new Date(openBreak.break_start);
      const duration = Math.max(0, Math.round((now.getTime() - start.getTime()) / (60 * 1000)));
      const over = Math.max(0, duration - openBreak.allowed_minutes);

      // 3. Update break_log
      const { error: endBreakErr } = await supabase
        .from('break_logs')
        .update({
          break_end: now.toISOString(),
          duration_minutes: duration,
          over_minutes: over
        })
        .eq('id', openBreak.id);
      if (endBreakErr) throw endBreakErr;

      const breakTypeLabels: Record<string, string> = {
        morning_tea: 'Morning Tea',
        food_break: 'Food Break',
        evening_tea: 'Evening Tea',
        unscheduled: 'Unscheduled'
      };
      const typeLabel = breakTypeLabels[openBreak.break_type] || openBreak.break_type;

      // 4. If over > 0
      if (over > 0) {
        await createNotification({
          type: 'absent_alert',
          title: 'Break Overstay',
          message: `${staff.name} returned ${over} mins late from ${typeLabel}`,
          branchId: staff.branch_id,
          staffId: staff.id,
          targetRole: 'staff_executive'
        });

        try {
          await supabase.from('wall_events').insert({
            event_type: 'break_overstay',
            staff_id: staff.id,
            staff_name: staff.name,
            branch_id: staff.branch_id,
            description: `${staff.name} overstayed ${typeLabel} by ${over} mins`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }
      } else {
        try {
          await supabase.from('wall_events').insert({
            event_type: 'break_end',
            staff_id: staff.id,
            staff_name: staff.name,
            branch_id: staff.branch_id,
            description: `${staff.name} returned — ${duration} mins`
          });
        } catch (e) {
          console.error('Silent insert wall event failed:', e);
        }
      }

      // 5. Show result overlay
      setResultData({
        status: over === 0 ? 'green' : 'red',
        icon: over === 0 ? 'circle-check' : 'alert-triangle',
        title: `Welcome Back ${staff.name}`,
        message: over === 0
          ? (
            <span style={{display:'flex',
              alignItems:'center', gap:'4px'}}>
              <CircleCheck size={14} strokeWidth={2} />
              {duration} mins · On time
            </span>
          )
          : `${duration} mins — ${over} mins over limit`,
        details: over === 0 ? '' : 'Branch HR has been notified'
      });
      setKioskState('RESULT');
      setTimeout(() => {
        resetKiosk();
        fetchStats();
      }, 4000);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error ending break.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const handleAcknowledgeAnnouncement = async () => {
    if (!activeAnnouncement || !staff) return;
    try {
      const { error } = await supabase
        .from('announcement_reads')
        .upsert({
          announcement_id: activeAnnouncement.id,
          staff_id: staff.id,
          read_on_kiosk: true,
          read_at: new Date().toISOString()
        }, { onConflict: 'announcement_id,staff_id' });

      if (error) throw error;
    } catch (e) {
      console.error('Failed to mark announcement as read:', e);
    }

    const nextIndex = pendingAnnouncements.indexOf(activeAnnouncement) + 1;
    if (nextIndex < pendingAnnouncements.length) {
      setActiveAnnouncement(pendingAnnouncements[nextIndex]);
    } else {
      setActiveAnnouncement(null);
      setPendingAnnouncements([]);
      resetKiosk();
    }
  };

  if (!currentTime) return null;

  return (
    <div className="fixed inset-0 bg-[#1A1A1A] text-white flex flex-col font-sans overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-8 pb-4">
        <div className="font-[900] text-[40px] tracking-tight flex items-center leading-none mb-1">
          <span className="text-white font-bold">near</span>
          <span className="text-white font-bold">bi</span>
        </div>
        <div className="text-[#999999] text-xs font-bold uppercase tracking-widest">
          Staff Attendance Kiosk
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative w-full max-w-sm mx-auto">
        
        {kioskState === 'IDLE' && (
          <div className="w-full flex flex-col items-center">
            {/* Live Clock */}
            <div className="text-white text-4xl font-extrabold mb-1 tracking-wide">
              {formatTime(currentTime)}
            </div>
            <div className="text-[#999999] text-xs font-medium mb-8">
              {formatDate(currentTime)}
            </div>

            <div className="text-[#999999] text-xs font-bold uppercase tracking-wider mb-4">
              Enter your 4-digit PIN
            </div>

            {/* PIN Dots */}
            <div className="flex space-x-5 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    pin.length > i
                      ? 'bg-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                      : 'border-2 border-[#333333] bg-transparent'
                  }`}
                />
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full px-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeyPress(num)}
                  className="bg-[#222222] hover:bg-[#2A2A2A] active:bg-[#2A2A2A] active:scale-95 text-white py-4 text-xl font-bold rounded-[12px] transition-all border border-[#333333] min-h-[48px]"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="bg-[#222222] hover:bg-[#2A2A2A] active:bg-[#2A2A2A] active:scale-95 text-[#C0392B] py-4 text-sm font-bold rounded-[12px] transition-all border border-[#333333] flex items-center justify-center min-h-[48px]"
              >
                DEL
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="bg-[#222222] hover:bg-[#2A2A2A] active:bg-[#2A2A2A] active:scale-95 text-white py-4 text-xl font-bold rounded-[12px] transition-all border border-[#333333] min-h-[48px]"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {}}
                className="bg-[#222222] text-[#555555] py-4 text-xl font-bold rounded-[12px] border border-[#333333] cursor-default flex items-center justify-center min-h-[48px]"
                disabled
              >
                <Check size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}

        {kioskState === 'LOADING' && (
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#333333] border-t-white rounded-full animate-spin"></div>
            <div className="text-[#999999] text-sm font-semibold">Processing...</div>
          </div>
        )}

        {kioskState === 'STAFF_FOUND' && staff && (() => {
          const isBreakStartVisible = (() => {
            if (!loadedBreakSettings) return true;
            const now = new Date();
            const current_time_mins = now.getHours() * 60 + now.getMinutes();

            const parseTimeToMins = (tStr: string) => {
              if (!tStr) return 0;
              const [h, m] = tStr.split(':').map(Number);
              return h * 60 + m;
            };

            const morning_start = parseTimeToMins(loadedBreakSettings.morning_tea_start);
            const morning_end = parseTimeToMins(loadedBreakSettings.morning_tea_end);
            const food_start = parseTimeToMins(loadedBreakSettings.food_break_start);
            const food_end = parseTimeToMins(loadedBreakSettings.food_break_end);
            const evening_start = parseTimeToMins(loadedBreakSettings.evening_tea_start);
            const evening_end = parseTimeToMins(loadedBreakSettings.evening_tea_end);

            if (current_time_mins >= morning_start && current_time_mins <= morning_end) {
              return loadedBreakSettings.morning_tea_enabled !== false;
            }
            if (current_time_mins >= food_start && current_time_mins <= food_end) {
              return loadedBreakSettings.food_break_enabled !== false;
            }
            if (current_time_mins >= evening_start && current_time_mins <= evening_end) {
              return loadedBreakSettings.evening_tea_enabled !== false;
            }
            return true;
          })();

          return (
            <div className="w-full flex flex-col items-center">
              <div className="text-[#999999] text-xs font-bold uppercase tracking-wider mb-1">
                Welcome back
              </div>
              <div className="text-3xl font-extrabold text-white text-center mb-1">
                {staff.name}
              </div>
              <div className="text-white text-xs font-bold mb-8 bg-white/10 px-3 py-1 rounded-[20px] border border-white/20">
                {staff.pay_type === 'hourly' ? (
                  <span>Pay Type: Hourly / Flexible</span>
                ) : (
                  <span>Shift: {staff.shift?.label} ({formatTime12hr(staff.shift?.start_time)} - {formatTime12hr(staff.shift?.end_time)})</span>
                )}
              </div>

              <div className="w-full grid grid-cols-2 gap-3.5 px-4">
                <button
                  type="button"
                  onClick={() => startCamera('CHECK_IN')}
                  className="bg-[rgba(45,122,58,0.15)] border border-[rgba(45,122,58,0.3)] hover:bg-[rgba(45,122,58,0.25)] text-[#2D7A3A] py-[18px] rounded-[12px] text-xs font-bold flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-all min-h-[48px]"
                >
                  <UserCheck size={22} strokeWidth={1.5} />
                  <span>CHECK IN</span>
                </button>

                <button
                  type="button"
                  onClick={() => startCamera('CHECK_OUT')}
                  className="bg-[rgba(26,95,168,0.15)] border border-[rgba(26,95,168,0.3)] hover:bg-[rgba(26,95,168,0.25)] text-[#1A5FA8] py-[18px] rounded-[12px] text-xs font-bold flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-all min-h-[48px]"
                >
                  <LogOut size={22} strokeWidth={1.5} />
                  <span>CHECK OUT</span>
                </button>

                {isBreakStartVisible ? (
                  <button
                    type="button"
                    onClick={handleBreakStart}
                    className="bg-[rgba(184,134,11,0.15)] border border-[rgba(184,134,11,0.3)] hover:bg-[rgba(184,134,11,0.25)] text-[#B8860B] py-[18px] rounded-[12px] text-xs font-bold flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-all min-h-[48px]"
                  >
                    <Coffee size={22} strokeWidth={1.5} />
                    <span>BREAK START</span>
                  </button>
                ) : (
                  <div className="bg-[#333]/10 border border-[#333]/20 text-[#666] py-[18px] rounded-[12px] text-xs font-bold flex flex-col items-center justify-center space-y-2 opacity-40 min-h-[48px] select-none">
                    <Coffee size={22} strokeWidth={1.5} />
                    <span className="uppercase text-[9px] tracking-wider font-extrabold text-red-500">Break Disabled</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleBreakEnd}
                  className="bg-transparent border border-white/20 hover:bg-white/10 text-white py-[18px] rounded-[12px] text-xs font-bold flex flex-col items-center justify-center space-y-2 active:scale-[0.98] transition-all min-h-[48px]"
                >
                  <RotateCcw size={22} strokeWidth={1.5} />
                  <span>BREAK END</span>
                </button>
              </div>

              <button
                type="button"
                onClick={resetKiosk}
                className="mt-8 border border-[#333333] text-[#999999] hover:text-white px-4 py-2.5 rounded-[12px] text-xs font-bold bg-transparent transition-all min-h-[40px]"
              >
                Cancel
              </button>
            </div>
          );
        })()}

        {kioskState === 'CAMERA' && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 md:p-8 backdrop-blur-sm">
            <div className="relative w-full max-w-xl h-full max-h-[85vh] bg-[#222222] rounded-[24px] border border-[#333333] overflow-hidden flex flex-col shadow-2xl">
              <button
                type="button"
                onClick={resetKiosk}
                className="absolute top-4 left-4 text-white font-bold bg-[#333333]/80 hover:bg-[#444444] border border-[#444444] px-4 py-2 rounded-[20px] text-xs z-50 active:scale-95 transition-all"
              >
                Cancel
              </button>

              {cameraError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 text-white">
                  <Camera size={48} strokeWidth={1.5} className="text-[#999999]" />
                  <h3 className="text-lg font-bold">Camera access required</h3>
                  <p className="text-sm text-[#999999]">
                    Please allow camera permissions in your browser settings to verify your identity.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCamera(flow)}
                    className="bg-white text-[#1A1A1A] font-bold px-6 py-2.5 rounded-[12px] text-sm active:scale-95"
                  >
                    Retry Camera
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/35" />

                    {/* Circular Face Overlay */}
                    <div className="z-10 w-56 h-56 md:w-64 md:h-64 rounded-full border-4 border-white shadow-[0_0_0_9999px_rgba(26,26,26,0.85)] flex items-center justify-center relative">
                      <div className="absolute inset-0 border-2 border-transparent rounded-full animate-pulse" />
                    </div>
                  </div>

                  <div className="p-5 bg-[#222222] border-t border-[#333333] flex justify-center pb-8 w-full">
                    <button
                      type="button"
                      onClick={handleCapture}
                      className="bg-white hover:bg-gray-200 text-[#1A1A1A] font-bold text-base py-3.5 px-10 rounded-[28px] active:scale-95 transition-transform flex items-center space-x-2 shadow-lg"
                    >
                      <Camera size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
                      <span>Take Photo</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Error Modal */}
        {kioskState === 'ERROR' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="bg-[#222222] border border-[#333333] text-white p-6 rounded-[14px] max-w-[280px] w-full text-center shadow-lg flex flex-col items-center">
              <AlertCircle size={48} strokeWidth={1.5} className="text-[#C0392B] mb-3" />
              <h3 className="text-base font-black leading-tight">{errorMsg}</h3>
            </div>
          </div>
        )}

        {/* Short Attendance Warning Modal */}
        {kioskState === 'SHORT_ATTENDANCE_WARNING' && pendingCheckout && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6">
            <div className="bg-[#222222] border border-[#333333] rounded-[20px] max-w-sm w-full p-6 flex flex-col justify-between shadow-2xl min-h-[280px]">
              <div className="space-y-4 text-center flex flex-col items-center">
                <AlertTriangle size={48} strokeWidth={1.5} className="text-[#B8860B] mb-2" />
                <h3 className="text-white text-lg font-black leading-tight">
                  Short Attendance Warning
                </h3>
                <p className="text-gray-300 text-sm font-medium leading-relaxed">
                  Only <span className="text-amber-500 font-extrabold">{pendingCheckout.durationMins} mins</span>. Sure?
                </p>
                <p className="text-[#999999] text-xs font-semibold">
                  Checking out now will mark your attendance as short attendance.
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => resetKiosk()}
                  className="flex-1 min-h-[44px] bg-transparent border border-[#333333] text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Cancel Checkout
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await saveCheckout(
                      pendingCheckout.record,
                      pendingCheckout.blob,
                      pendingCheckout.nowForCheckout,
                      pendingCheckout.durationMins,
                      true
                    );
                  }}
                  className="flex-1 min-h-[44px] bg-[#B8860B] hover:bg-[#9E720A] text-white font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                >
                  Continue Checkout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Kiosk Announcement Overlay */}
        {activeAnnouncement && (
          <div className="absolute inset-0 z-[13000] flex items-center justify-center bg-black/95 backdrop-blur-md p-6">
            <div className="bg-[#222222] border border-[#333333] rounded-[20px] max-w-sm w-full p-6 flex flex-col justify-between shadow-2xl min-h-[350px]">
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-amber-500 font-extrabold text-xs tracking-wider uppercase">
                  <span>📢 Message from Management</span>
                  {activeAnnouncement.is_important && (
                    <span className="bg-red-500/20 text-red-500 border border-red-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded">
                      IMPORTANT
                    </span>
                  )}
                </div>
                <h3 className="text-white text-xl font-black leading-tight">
                  {activeAnnouncement.title}
                </h3>
                <p className="text-gray-300 text-sm font-medium leading-relaxed max-h-[200px] overflow-y-auto pr-1 whitespace-pre-wrap">
                  {activeAnnouncement.message}
                </p>
              </div>

              <button
                type="button"
                onClick={handleAcknowledgeAnnouncement}
                className="w-full min-h-[44px] bg-white hover:bg-gray-200 text-[#1A1A1A] font-bold text-sm rounded-xl active:scale-95 transition-all mt-6 shadow-md"
              >
                Okay, got it
              </button>
            </div>
          </div>
        )}

        {/* Result Overlay */}
        {kioskState === 'RESULT' && resultData && staff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
            <div
              className={`p-8 rounded-[14px] max-w-[300px] w-full text-center shadow-lg flex flex-col items-center border ${
                resultData.status === 'green'
                  ? 'bg-[rgba(45,122,58,0.12)] border-[rgba(45,122,58,0.3)] text-[#4ADE80]'
                  : resultData.status === 'yellow'
                  ? 'bg-[rgba(184,134,11,0.12)] border-[rgba(184,134,11,0.3)] text-[#FBBF24]'
                  : resultData.status === 'orange'
                  ? 'bg-[rgba(251,146,60,0.12)] border-[rgba(251,146,60,0.3)] text-[#FB923C]'
                  : resultData.status === 'red'
                  ? 'bg-[rgba(192,57,43,0.12)] border-[rgba(192,57,43,0.3)] text-[#F87171]'
                  : 'bg-[rgba(26,95,168,0.12)] border-[rgba(26,95,168,0.3)] text-[#60A5FA]'
              }`}
            >
              <div className="mb-4">
                {resultData.icon === 'coffee' ? (
                  <Coffee size={64} strokeWidth={1.5} className="text-[#FBBF24]" />
                ) : resultData.icon === 'rotate-ccw' ? (
                  <RotateCcw size={48} strokeWidth={1.5} className="text-white" />
                ) : resultData.icon === 'circle-check' ? (
                  <CircleCheck size={64} strokeWidth={1.5} className="text-[#4ADE80]" />
                ) : resultData.status === 'green' ? (
                  <UserCheck size={48} strokeWidth={1.5} className="text-[#4ADE80]" />
                ) : resultData.status === 'blue' ? (
                  <LogOut size={48} strokeWidth={1.5} className="text-[#60A5FA]" />
                ) : (
                  <AlertTriangle size={48} strokeWidth={1.5} className="text-[#FBBF24]" />
                )}
              </div>

              <h2 className="text-2xl font-black mb-1 truncate max-w-full text-white">{staff.name}</h2>
              <div className="bg-white/10 border border-white/20 text-xs font-bold px-3 py-1 rounded-[20px] mb-5 text-white">
                {formatTime(currentTime).split(' ')[0]}
              </div>

              <h3 className="text-lg font-bold mb-1 leading-snug">{resultData.title}</h3>
              <p className="text-sm opacity-90 leading-normal">{resultData.message}</p>
              {resultData.details && (
                <p className="text-xs mt-3 bg-white/10 border border-white/20 px-3 py-1.5 rounded text-white font-semibold">
                  {resultData.details}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Kiosk Status Bar */}
      {kioskState !== 'CAMERA' && (
        <div className="bg-[#222222] border-t border-[#333333] py-4 px-6 flex justify-between items-center text-xs font-bold tracking-wider text-[#999999] select-none pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center space-x-1.5">
            <UserCheck size={16} strokeWidth={1.5} className="text-[#2D7A3A]" />
            <span className="text-white font-bold">{stats.checkedIn}</span>
            <span>Checked in</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Timer size={16} strokeWidth={1.5} className="text-[#B8860B]" />
            <span className="text-white font-bold">{stats.late}</span>
            <span>Late</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Coffee size={16} strokeWidth={1.5} className="text-[#B8860B]" />
            <span className="text-white font-bold">{stats.onBreak || 0}</span>
            <span>On break</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <LogOut size={16} strokeWidth={1.5} className="text-[#1A5FA8]" />
            <span className="text-white font-bold">{stats.checkedOut}</span>
            <span>Checked out</span>
          </div>
        </div>
      )}

      {/* Discreet Sign Out Button */}
      <button
        type="button"
        onClick={() => setShowSignOutConfirm(true)}
        style={{
          position: 'fixed',
          bottom: 'env(safe-area-inset-bottom, 8px)',
          right: '12px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.3)',
          fontSize: '11px',
          padding: '4px 10px',
          borderRadius: '6px',
          cursor: 'pointer',
          zIndex: 100,
        }}
      >
        Sign out
      </button>

      {/* Sign Out Confirmation Modal */}
      {showSignOutConfirm && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#222222] border border-[#333333] rounded-[14px] max-w-xs w-full p-6 flex flex-col space-y-4 shadow-lg text-center">
            <div className="flex flex-col items-center">
              <AlertTriangle size={36} strokeWidth={1.5} className="text-[#B8860B] mb-2" />
              <h3 className="text-white text-base font-bold">Sign out of kiosk?</h3>
              <p className="text-[#999999] text-xs font-semibold mt-1">
                You will need to sign in again to access this branch kiosk.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="flex-1 min-h-[38px] bg-transparent border border-[#333333] text-white font-bold text-xs rounded-[12px] active:scale-95 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                className="flex-1 min-h-[38px] bg-[#C0392B] hover:bg-[#A93226] text-white font-bold text-xs rounded-[12px] active:scale-95 transition-all cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
