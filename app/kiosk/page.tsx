'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { Check, LogOut, Camera, AlertCircle, UserCheck, Timer, AlertTriangle } from 'lucide-react';

type KioskState = 'IDLE' | 'LOADING' | 'STAFF_FOUND' | 'CAMERA' | 'RESULT' | 'ERROR';
type FlowType = 'CHECK_IN' | 'CHECK_OUT' | null;

export default function KioskPage() {
  const { user, userBranch } = useAuth();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [kioskState, setKioskState] = useState<KioskState>('IDLE');
  const [pin, setPin] = useState('');
  const [staff, setStaff] = useState<any>(null);
  const [flow, setFlow] = useState<FlowType>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraError, setCameraError] = useState(false);
  const [stats, setStats] = useState({ checkedIn: 0, late: 0, checkedOut: 0 });

  const [resultData, setResultData] = useState<{
    status: 'green' | 'yellow' | 'orange' | 'red' | 'blue';
    title: string;
    message: string;
    details?: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize clock client-side to prevent SSR mismatch
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch branch-isolated stats every 30 seconds
  const fetchStats = async () => {
    if (!userBranch) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      // Fetch attendance for today
      const { data: attendanceData, error } = await supabase
        .from('attendance')
        .select('status, check_in_time, check_out_time, staff!inner(branch_id)')
        .eq('date', todayStr)
        .eq('staff.branch_id', userBranch);

      if (error) throw error;

      let checkedIn = 0;
      let late = 0;
      let checkedOut = 0;

      if (attendanceData) {
        attendanceData.forEach((row) => {
          if (row.check_in_time) checkedIn++;
          if (row.status === 'late') late++;
          if (row.check_out_time) checkedOut++;
        });
      }

      setStats({ checkedIn, late, checkedOut });
    } catch (err) {
      console.error('Error fetching kiosk stats:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [userBranch]);

  // Submit PIN automatic lookups
  useEffect(() => {
    if (pin.length === 4) {
      handleLookup(pin);
    }
  }, [pin]);

  const handleLookup = async (enteredPin: string) => {
    setKioskState('LOADING');
    try {
      // Find active staff member in the current branch with this PIN
      let query = supabase
        .from('staff')
        .select('*, shift:shifts(*)')
        .eq('pin', enteredPin)
        .eq('active', true);

      if (userBranch) {
        query = query.eq('branch_id', userBranch);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error('PIN not recognised');
      }

      setStaff(data);
      setKioskState('STAFF_FOUND');
    } catch (err: any) {
      console.error(err);
      setErrorMsg('PIN not recognised');
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

  const startCamera = async (type: FlowType) => {
    setFlow(type);
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
      });
      streamRef.current = stream;
      setKioskState('CAMERA');
      // Wait for video element ref to populate
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
    const filePath = `${staff.id}/${filename}`;
    const { error: uploadError } = await supabase.storage
      .from('attendance-photos')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('attendance-photos').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleCapture = async () => {
    if (!staff || !flow) return;
    setKioskState('LOADING');

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const blob = await takePhotoBlob();
      stopCamera();

      if (flow === 'CHECK_IN') {
        const photoUrl = await uploadPhoto(blob, `${todayStr}_checkin.jpg`);
        const now = new Date();
        const checkInTimeStr = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"

        const shiftStartStr = staff.shift.start_time; // "HH:MM"
        const [sh, sm] = shiftStartStr.split(':').map(Number);
        const shiftMins = sh * 60 + sm;
        const currentMins = now.getHours() * 60 + now.getMinutes();

        // Calculate early in
        let earlyInMinutes = 0;
        if (currentMins < shiftMins) {
          earlyInMinutes = shiftMins - currentMins;
        }

        // Calculate minutes late
        let minutesLate = 0;
        let status: 'present' | 'late' = 'present';
        let colorCode: 'green' | 'yellow' | 'orange' | 'red' = 'green';

        if (currentMins > shiftMins) {
          minutesLate = currentMins - shiftMins;
          if (minutesLate > 5) {
            status = 'late';
          }
          
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

        const isExempt = !!exemption;
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
            yellow_free_passes: 4,
          };

          if (colorCode === 'yellow') {
            // Check free passes count in current month
            const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const { count, error: countErr } = await supabase
              .from('attendance')
              .select('*', { count: 'exact', head: true })
              .eq('staff_id', staff.id)
              .eq('color_code', 'yellow')
              .gte('date', firstDayOfMonth)
              .lte('date', todayStr);

            if (!countErr && count !== null && count >= settings.yellow_free_passes) {
              fineAmount = Number(settings.yellow_fine);
            }
          } else if (colorCode === 'orange') {
            fineAmount = Number(settings.orange_fine);
          } else if (colorCode === 'red') {
            fineAmount = Number(settings.red_fine);
          }
        }

        // Upsert attendance
        const { error: attendanceErr } = await supabase.from('attendance').upsert(
          {
            staff_id: staff.id,
            date: todayStr,
            check_in_time: checkInTimeStr,
            status,
            color_code: colorCode,
            minutes_late: minutesLate,
            early_in_minutes: earlyInMinutes,
            early_in_approved: false,
            check_in_photo: photoUrl,
            marked_by: 'kiosk',
          },
          { onConflict: 'staff_id,date' }
        );

        if (attendanceErr) throw attendanceErr;

        // Insert late fines if any
        if (fineAmount > 0) {
          const currentMonthStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
          await supabase.from('late_fines').insert({
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
            branchId: userBranch,
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
            branchId: userBranch,
            staffId: staff.id,
            relatedId: todayStr,
            targetRole: 'staff_executive',
          });
        }

        // Set result screen parameters
        let resTitle = 'On Time ✅';
        let resMsg = 'Have a great shift!';
        let resDetails = '';

        if (colorCode === 'yellow') {
          resTitle = `${minutesLate} mins late 🟡`;
          resMsg = fineAmount > 0 ? `Late arrival fine applied: ₹${fineAmount}` : 'Yellow free pass applied (no fine)';
        } else if (colorCode === 'orange') {
          resTitle = `${minutesLate} mins late 🟠`;
          resMsg = `Late arrival fine: ₹${fineAmount}`;
        } else if (colorCode === 'red') {
          resTitle = `${minutesLate} mins late 🔴`;
          resMsg = `Late arrival fine: ₹${fineAmount}`;
        }

        if (earlyInMinutes > 0) {
          resDetails = `Early In: ${earlyInMinutes} mins (Pending approval)`;
        }

        setResultData({
          status: colorCode,
          title: resTitle,
          message: resMsg,
          details: resDetails,
        });

        setKioskState('RESULT');
        setTimeout(() => {
          resetKiosk();
          fetchStats();
        }, 4000);

      } else if (flow === 'CHECK_OUT') {
        // Query today's attendance record
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

        const photoUrl = await uploadPhoto(blob, `${todayStr}_checkout.jpg`);
        const now = new Date();
        const checkOutTimeStr = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"

        // Calculate hours worked
        const [ciH, ciM] = record.check_in_time.split(':').map(Number);
        const checkInMins = ciH * 60 + ciM;
        const checkOutMins = now.getHours() * 60 + now.getMinutes();

        const actualHoursWorked = Math.max(0, (checkOutMins - checkInMins) / 60);
        const shiftHours = Number(staff.shift.hours);

        let otMinutes = 0;
        let isEarlyLeave = false;
        let earlyLeaveMinutes = 0;

        if (actualHoursWorked > shiftHours + 0.5) {
          otMinutes = Math.round((actualHoursWorked - shiftHours - 0.5) * 60);
        } else if (actualHoursWorked < shiftHours) {
          isEarlyLeave = true;
          earlyLeaveMinutes = Math.round((shiftHours - actualHoursWorked) * 60);
        }

        // Update attendance
        const { error: checkoutErr } = await supabase
          .from('attendance')
          .update({
            check_out_time: checkOutTimeStr,
            check_out_photo: photoUrl,
            actual_hours_worked: Math.round(actualHoursWorked * 100) / 100,
            ot_minutes: otMinutes,
            ot_approved: false, // pending approval
          })
          .eq('id', record.id);

        if (checkoutErr) throw checkoutErr;

        // Create OT adjustments and notifications if OT is > 0
        if (otMinutes > 0) {
          await supabase.from('attendance_adjustments').insert({
            staff_id: staff.id,
            date: todayStr,
            type: 'ot',
            minutes: otMinutes,
            status: 'pending',
          });

          await createNotification({
            type: 'ot_pending',
            title: 'OT Approval Required',
            message: `${staff.name} completed ${otMinutes}m Overtime.`,
            branchId: userBranch,
            staffId: staff.id,
            relatedId: todayStr,
            targetRole: 'staff_executive',
          });
        }

        let resMsg = 'Checked out successfully!';
        let resDetails = '';

        if (otMinutes > 0) {
          const h = Math.floor(otMinutes / 60);
          const m = otMinutes % 60;
          resDetails = `OT pending approval: ${h > 0 ? h + 'h ' : ''}${m}m`;
        } else if (isEarlyLeave) {
          const h = Math.floor(earlyLeaveMinutes / 60);
          const m = earlyLeaveMinutes % 60;
          resDetails = `Left early: ${h > 0 ? h + 'h ' : ''}${m}m (deduction applies)`;
        }

        setResultData({
          status: 'blue',
          title: 'CHECKED OUT ✓',
          message: resMsg,
          details: resDetails,
        });

        setKioskState('RESULT');
        setTimeout(() => {
          resetKiosk();
          fetchStats();
        }, 4000);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during submission.');
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

  if (!currentTime) return null;

  return (
    <div className="fixed inset-0 bg-[#1E2028] text-white flex flex-col font-sans overflow-hidden select-none">
      {/* Top Header */}
      <div className="flex flex-col items-center pt-8 pb-4">
        <div className="font-[900] text-[40px] tracking-tight flex items-center leading-none mb-1">
          <span className="text-white">near</span>
          <span className="text-white">bi</span>
        </div>
        <div className="text-[#6B7280] text-xs font-bold uppercase tracking-widest">
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
            <div className="text-[#6B7280] text-xs font-medium mb-8">
              {formatDate(currentTime)}
            </div>

            <div className="text-[#9CA3AF] text-xs font-bold uppercase tracking-wider mb-4">
              Enter your 4-digit PIN
            </div>

            {/* PIN Dots */}
            <div className="flex space-x-5 mb-8">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4.5 h-4.5 rounded-full transition-all duration-200 ${
                    pin.length > i
                      ? 'bg-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                      : 'border-2 border-[#2A2D38] bg-transparent'
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
                  className="bg-[#252830] hover:bg-[#2E3140] active:bg-[#2E3140] active:scale-95 text-white py-4 text-xl font-bold rounded-xl transition-all border border-[#2A2D38]"
                >
                  {num}
                </button>
              ))}
              <button
                type="button"
                onClick={handleBackspace}
                className="bg-[#252830] hover:bg-[#2E3140] active:bg-[#2E3140] active:scale-95 text-[#F87171] py-4 text-sm font-bold rounded-xl transition-all border border-[#2A2D38] flex items-center justify-center"
              >
                DEL
              </button>
              <button
                type="button"
                onClick={() => handleKeyPress('0')}
                className="bg-[#252830] hover:bg-[#2E3140] active:bg-[#2E3140] active:scale-95 text-white py-4 text-xl font-bold rounded-xl transition-all border border-[#2A2D38]"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {}}
                className="bg-[#252830] text-gray-500 py-4 text-xl font-bold rounded-xl border border-[#2A2D38] cursor-default"
                disabled
              >
                ✓
              </button>
            </div>
          </div>
        )}

        {kioskState === 'LOADING' && (
          <div className="flex flex-col items-center space-y-3">
            <div className="w-10 h-10 border-4 border-[#2E3140] border-t-white rounded-full animate-spin"></div>
            <div className="text-gray-400 text-sm font-semibold">Processing...</div>
          </div>
        )}

        {kioskState === 'STAFF_FOUND' && staff && (
          <div className="w-full flex flex-col items-center">
            <div className="text-[#6B7280] text-xs font-bold uppercase tracking-wider mb-1">
              Welcome back
            </div>
            <div className="text-3xl font-extrabold text-white text-center mb-1">
              {staff.name}
            </div>
            <div className="text-white text-xs font-bold mb-8 bg-white/10 px-3 py-1 rounded-full border border-white/20">
              Shift: {staff.shift?.label} ({staff.shift?.start_time} - {staff.shift?.end_time})
            </div>

            <div className="w-full space-y-3.5 px-4">
              <button
                type="button"
                onClick={() => startCamera('CHECK_IN')}
                className="w-full bg-[rgba(74,222,128,0.15)] border border-[rgba(74,222,128,0.3)] hover:bg-[rgba(74,222,128,0.25)] text-[#4ADE80] py-[18px] rounded-xl text-base font-bold flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"
              >
                <UserCheck size={22} strokeWidth={1.5} />
                <span>CHECK IN</span>
              </button>

              <button
                type="button"
                onClick={() => startCamera('CHECK_OUT')}
                className="w-full bg-[rgba(96,165,250,0.15)] border border-[rgba(96,165,250,0.3)] hover:bg-[rgba(96,165,250,0.25)] text-[#60A5FA] py-[18px] rounded-xl text-base font-bold flex items-center justify-center space-x-2 active:scale-[0.98] transition-all"
              >
                <LogOut size={22} strokeWidth={1.5} />
                <span>CHECK OUT</span>
              </button>
            </div>

            <button
              type="button"
              onClick={resetKiosk}
              className="mt-8 border border-[#363A48] text-[#9CA3AF] hover:text-white px-4 py-2 rounded-xl text-xs font-bold bg-transparent transition-all"
            >
              Cancel
            </button>
          </div>
        )}

        {kioskState === 'CAMERA' && (
          <div className="absolute inset-0 bg-[#1E2028] z-50 flex flex-col">
            <button
              type="button"
              onClick={resetKiosk}
              className="absolute top-6 left-6 text-white font-bold bg-[#252830]/80 border border-[#363A48] px-4 py-2 rounded-full text-xs z-50 active:scale-95"
            >
              Cancel
            </button>

            {cameraError ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <Camera size={48} strokeWidth={1.5} className="text-[#9CA3AF]" />
                <h3 className="text-lg font-bold">Camera access required</h3>
                <p className="text-sm text-[#9CA3AF]">
                  Please allow camera permissions in your browser settings to verify your identity.
                </p>
                <button
                  type="button"
                  onClick={() => startCamera(flow)}
                  className="bg-white text-[#1E2028] font-bold px-6 py-2.5 rounded-lg text-sm active:scale-95"
                >
                  Retry Camera
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40" />

                  {/* Circular Face Overlay */}
                  <div className="z-10 w-64 h-64 rounded-full border-4 border-white shadow-[0_0_0_9999px_rgba(30,32,40,0.85)] flex items-center justify-center relative">
                    <div className="absolute inset-0 border-2 border-transparent rounded-full animate-pulse" />
                  </div>
                </div>

                <div className="p-6 bg-[#252830] border-t border-[#2A2D38] flex justify-center pb-12">
                  <button
                    type="button"
                    onClick={handleCapture}
                    className="bg-white hover:bg-gray-200 text-[#1E2028] font-black text-base py-3.5 px-10 rounded-full active:scale-95 transition-transform flex items-center space-x-2 shadow-lg"
                  >
                    <Camera size={18} strokeWidth={1.5} style={{ color: 'currentColor' }} />
                    <span>Take Photo</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Error Modal */}
        {kioskState === 'ERROR' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="bg-[#2E3140] border border-[#363A48] text-white p-6 rounded-2xl max-w-[280px] w-full text-center shadow-2xl flex flex-col items-center">
              <AlertCircle size={48} strokeWidth={1.5} className="text-[#F87171] mb-3" />
              <h3 className="text-base font-black leading-tight">{errorMsg}</h3>
            </div>
          </div>
        )}

        {/* Result Overlay */}
        {kioskState === 'RESULT' && resultData && staff && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md">
            <div
              className={`p-8 rounded-[24px] max-w-[300px] w-full text-center shadow-2xl flex flex-col items-center border ${
                resultData.status === 'green'
                  ? 'bg-[rgba(74,222,128,0.12)] border-[rgba(74,222,128,0.3)] text-[#4ADE80]'
                  : resultData.status === 'yellow'
                  ? 'bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.3)] text-[#FBBF24]'
                  : resultData.status === 'orange'
                  ? 'bg-[rgba(251,146,60,0.12)] border-[rgba(251,146,60,0.3)] text-[#FB923C]'
                  : resultData.status === 'red'
                  ? 'bg-[rgba(248,113,113,0.12)] border-[rgba(248,113,113,0.3)] text-[#F87171]'
                  : 'bg-[rgba(96,165,250,0.12)] border-[rgba(96,165,250,0.3)] text-[#60A5FA]'
              }`}
            >
              <div className="mb-4">
                {resultData.status === 'green' ? (
                  <UserCheck size={48} strokeWidth={1.5} className="text-[#4ADE80]" />
                ) : resultData.status === 'blue' ? (
                  <LogOut size={48} strokeWidth={1.5} className="text-[#60A5FA]" />
                ) : (
                  <AlertTriangle size={48} strokeWidth={1.5} className="text-[#FBBF24]" />
                )}
              </div>

              <h2 className="text-2xl font-black mb-1 truncate max-w-full text-white">{staff.name}</h2>
              <div className="bg-white/10 border border-white/20 text-xs font-bold px-3 py-1 rounded-full mb-5 text-white">
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
        <div className="bg-[#252830] border-t border-[#2A2D38] py-4 px-6 flex justify-between items-center text-xs font-black tracking-wider text-[#6B7280] select-none pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center space-x-1.5">
            <UserCheck size={16} strokeWidth={1.5} className="text-[#4ADE80]" />
            <span className="text-white font-bold">{stats.checkedIn}</span>
            <span>Checked in</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Timer size={16} strokeWidth={1.5} className="text-[#FBBF24]" />
            <span className="text-white font-bold">{stats.late}</span>
            <span>Late</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <LogOut size={16} strokeWidth={1.5} className="text-[#60A5FA]" />
            <span className="text-white font-bold">{stats.checkedOut}</span>
            <span>Checked out</span>
          </div>
        </div>
      )}
    </div>
  );
}
