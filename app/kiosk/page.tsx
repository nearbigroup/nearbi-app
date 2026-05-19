'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { calculateOTMinutes } from '@/lib/salary';

type KioskState = 'IDLE' | 'LOADING' | 'STAFF_FOUND' | 'CAMERA' | 'RESULT' | 'ERROR';
type FlowType = 'CHECK_IN' | 'CHECK_OUT' | null;

export default function KioskPage() {
  const { user, branch } = useAuth();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [kioskState, setKioskState] = useState<KioskState>('IDLE');
  const [pin, setPin] = useState('');
  const [staff, setStaff] = useState<any>(null);
  
  const [flow, setFlow] = useState<FlowType>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [resultMsg, setResultMsg] = useState<{ type: 'PRESENT' | 'LATE' | 'CHECKED_OUT' | 'ERROR', title: string, subtitle: string, sub2?: string } | null>(null);
  
  const [stats, setStats] = useState({ checkedIn: 0, late: 0, checkedOut: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Stats polling
  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('attendance')
        .select('status, check_in_time, check_out_time, staff:staff_id(branch_id)')
        .eq('date', today);
      
      if (data) {
        const branchData = data.filter(r => {
          const staffObj = Array.isArray(r.staff) ? r.staff[0] : r.staff;
          return staffObj?.branch_id === branch;
        });
        
        let checkedIn = 0;
        let late = 0;
        let checkedOut = 0;
        
        for (const row of branchData) {
          if (row.check_in_time) checkedIn++;
          if (row.status === 'late') late++;
          if (row.check_out_time) checkedOut++;
        }
        setStats({ checkedIn, late, checkedOut });
      }
    };
    
    fetchStats();
    const timer = setInterval(fetchStats, 30000);
    return () => clearInterval(timer);
  }, [branch]);

  // Handle PIN entry
  useEffect(() => {
    if (pin.length === 4 && kioskState === 'IDLE') {
      lookupStaff(pin);
    }
  }, [pin, kioskState]);

  const lookupStaff = async (enteredPin: string) => {
    setKioskState('LOADING');
    const { data, error } = await supabase
      .from('staff')
      .select('*, shift:shifts(*), branch:branches(*)')
      .eq('pin', enteredPin)
      .single();

    if (error || !data) {
      setErrorMsg('PIN not recognised. Please try again.');
      setKioskState('ERROR');
      setTimeout(() => {
        setPin('');
        setKioskState('IDLE');
      }, 2500);
    } else {
      setStaff(data);
      setKioskState('STAFF_FOUND');
    }
  };

  const handleKeyPress = (key: string) => {
    if (kioskState !== 'IDLE') return;
    if (key === 'DEL') {
      setPin(prev => prev.slice(0, -1));
    } else if (pin.length < 4) {
      setPin(prev => prev + key);
    }
  };

  const startCamera = async (type: FlowType) => {
    setFlow(type);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setKioskState('CAMERA');
    } catch (err) {
      setErrorMsg('Camera access required. Please allow camera access in your browser settings.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  };

  const resetKiosk = () => {
    stopCamera();
    setPin('');
    setStaff(null);
    setFlow(null);
    setKioskState('IDLE');
    setResultMsg(null);
  };

  const capturePhoto = async (): Promise<Blob | null> => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  };

  const uploadPhoto = async (blob: Blob, path: string) => {
    const { data, error } = await supabase.storage.from('attendance-photos').upload(path, blob, { upsert: true });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('attendance-photos').getPublicUrl(path);
    return publicUrl;
  };

  const handleAction = async () => {
    if (!staff || !flow) return;
    setKioskState('LOADING');
    
    try {
      if (flow === 'CHECK_IN') {
        // Pre-check if already checked in today
        const today = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase.from('attendance').select('id').eq('staff_id', staff.id).eq('date', today).single();
        
        if (existing) {
          setErrorMsg('Already checked in today.');
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        const blob = await capturePhoto();
        stopCamera();
        
        let photoUrl = '';
        if (blob) {
          const path = `${staff.id}/${today}_checkin.jpg`;
          photoUrl = await uploadPhoto(blob, path);
        }

        const now = new Date();
        const checkInTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        const shiftStartStr = staff.shift.start_time;
        const [sh, sm] = shiftStartStr.split(':').map(Number);
        const shiftMins = sh * 60 + sm;
        const currentMins = now.getHours() * 60 + now.getMinutes();
        
        let status = 'present';
        let minutesLate = 0;
        
        if (currentMins > shiftMins + 5) {
          status = 'late';
          minutesLate = currentMins - shiftMins;
        }

        await supabase.from('attendance').upsert({
          staff_id: staff.id,
          date: today,
          check_in_time: checkInTimeStr,
          status,
          check_in_photo: photoUrl,
          minutes_late: minutesLate,
          marked_by: 'kiosk'
        }, { onConflict: 'staff_id,date' });

        if (status === 'late') {
          setResultMsg({
            type: 'LATE',
            title: 'CHECKED IN — LATE',
            subtitle: `You are ${minutesLate} minutes late`,
            sub2: `${staff.department} • ${staff.branch?.name}`
          });
        } else {
          setResultMsg({
            type: 'PRESENT',
            title: 'CHECKED IN ✓',
            subtitle: 'Have a great shift!',
            sub2: `${staff.department} • ${staff.branch?.name}`
          });
        }

      } else if (flow === 'CHECK_OUT') {
        const today = new Date().toISOString().split('T')[0];
        const { data: record, error } = await supabase.from('attendance').select('*').eq('staff_id', staff.id).eq('date', today).single();
        
        if (!record) {
          stopCamera();
          setErrorMsg("You haven't checked in today");
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        if (record.check_out_time) {
          stopCamera();
          setErrorMsg("Already checked out");
          setKioskState('ERROR');
          setTimeout(() => resetKiosk(), 2500);
          return;
        }

        const blob = await capturePhoto();
        stopCamera();
        
        let photoUrl = '';
        if (blob) {
          const path = `${staff.id}/${today}_checkout.jpg`;
          photoUrl = await uploadPhoto(blob, path);
        }

        const now = new Date();
        const checkOutTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        const [eh, em] = staff.shift.end_time.split(':').map(Number);
        const shiftEndMins = eh * 60 + em;
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const diff = currentMins - shiftEndMins;
        const otMinutes = diff >= 30 ? diff - 30 : 0;

        await supabase.from('attendance').update({
          check_out_time: checkOutTimeStr,
          check_out_photo: photoUrl,
          ot_minutes: otMinutes
        }).eq('id', record.id);

        let otText = "No overtime today";
        if (otMinutes > 0) {
          const h = Math.floor(otMinutes / 60);
          const m = otMinutes % 60;
          otText = `OT: ${h > 0 ? h + 'h ' : ''}${m}min recorded`;
        }

        setResultMsg({
          type: 'CHECKED_OUT',
          title: 'CHECKED OUT ✓',
          subtitle: otText
        });
      }

      setKioskState('RESULT');
      setTimeout(() => resetKiosk(), 4000);
      
    } catch (err) {
      console.error(err);
      stopCamera();
      setErrorMsg('An error occurred. Please try again.');
      setKioskState('ERROR');
      setTimeout(() => resetKiosk(), 3000);
    }
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };
  
  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] text-white flex flex-col font-sans overflow-hidden">
      {/* Top Section */}
      <div className="flex-none flex flex-col items-center pt-10 pb-6">
        <div className="font-bold text-5xl tracking-tight flex mb-2">
          <span className="text-gray-100">near</span>
          <span className="text-brand-accent">bi</span>
        </div>
        <div className="text-gray-500 font-medium tracking-wide">Staff Attendance Kiosk</div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center relative px-4 w-full max-w-md mx-auto">
        
        {kioskState === 'IDLE' && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="text-brand-accent text-5xl font-bold mb-2 tracking-wider">
              {formatTime(currentTime)}
            </div>
            <div className="text-gray-400 font-medium mb-12">
              {formatDate(currentTime)}
            </div>

            <div className="text-gray-400 mb-6 font-medium tracking-wide">Enter your 4-digit PIN</div>
            
            <div className="flex space-x-6 mb-12">
              {[0, 1, 2, 3].map(i => (
                <div 
                  key={i} 
                  className={`w-5 h-5 rounded-full transition-all duration-300 ${
                    pin.length > i 
                      ? 'bg-brand-accent scale-110 shadow-[0_0_15px_rgba(245,168,0,0.5)]' 
                      : 'border-2 border-gray-700 bg-transparent'
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 w-full px-6">
              {['1','2','3','4','5','6','7','8','9','DEL','0','✓'].map((key) => (
                <button
                  key={key}
                  onClick={() => handleKeyPress(key)}
                  className={`py-5 rounded-2xl text-2xl font-semibold transition-all active:scale-95 ${
                    key === 'DEL' ? 'bg-[#1A1A1A] text-gray-400' :
                    key === '✓' ? 'bg-brand-accent/20 text-brand-accent' :
                    'bg-[#1A1A1A] text-white hover:bg-[#222]'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        )}

        {kioskState === 'LOADING' && (
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-gray-800 border-t-brand-accent rounded-full animate-spin mb-4"></div>
            <div className="text-gray-400">Processing...</div>
          </div>
        )}

        {kioskState === 'STAFF_FOUND' && staff && (
          <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-8 duration-300">
            <div className="text-gray-400 mb-2">Welcome,</div>
            <div className="text-4xl font-bold text-white mb-2 text-center">{staff.name}</div>
            <div className="text-brand-accent mb-12 font-medium bg-brand-accent/10 px-4 py-1.5 rounded-full">
              Shift: {staff.shift?.label}
            </div>

            <div className="w-full space-y-4 px-4">
              <button
                onClick={() => startCamera('CHECK_IN')}
                className="w-full bg-[#2E7D32] text-white py-5 rounded-2xl text-2xl font-bold flex items-center justify-center space-x-3 active:scale-95 transition-all shadow-[0_0_20px_rgba(46,125,50,0.3)]"
              >
                <span>✅</span>
                <span>CHECK IN</span>
              </button>
              
              <button
                onClick={() => startCamera('CHECK_OUT')}
                className="w-full bg-[#185FA5] text-white py-5 rounded-2xl text-2xl font-bold flex items-center justify-center space-x-3 active:scale-95 transition-all shadow-[0_0_20px_rgba(24,95,165,0.3)]"
              >
                <span>🚪</span>
                <span>CHECK OUT</span>
              </button>
            </div>
            
            <button 
              onClick={resetKiosk}
              className="mt-10 text-gray-500 font-medium px-6 py-2"
            >
              Cancel
            </button>
          </div>
        )}

        {kioskState === 'CAMERA' && (
          <div className="absolute inset-0 bg-black z-50 flex flex-col animate-in fade-in duration-300">
            <button onClick={resetKiosk} className="absolute top-8 left-6 text-white font-medium z-50 bg-black/50 px-4 py-2 rounded-full">
              Cancel
            </button>
            
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                className="absolute w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40"></div>
              
              <div className="z-10 w-72 h-72 rounded-full border-4 border-brand-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 border-[8px] border-transparent rounded-full animate-[pulse_2s_ease-in-out_infinite]"></div>
              </div>
              
              <div className="absolute top-1/4 z-10 text-center w-full">
                <div className="bg-black/60 text-white px-6 py-3 rounded-full inline-block font-medium border border-gray-700">
                  Position your face in the frame
                </div>
              </div>
            </div>
            
            <div className="p-8 pb-16 bg-gradient-to-t from-black via-black/90 to-transparent absolute bottom-0 w-full flex justify-center">
              <button 
                onClick={handleAction}
                className="bg-brand-accent text-[#111] font-bold text-xl py-4 px-12 rounded-full active:scale-95 transition-transform flex items-center space-x-2"
              >
                <span>📸</span>
                <span>Take Photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {kioskState === 'ERROR' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#D32F2F] text-white p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl mx-4">
              <div className="text-5xl mb-4">❌</div>
              <h3 className="text-xl font-bold mb-2">{errorMsg}</h3>
            </div>
          </div>
        )}

        {/* Result Overlay */}
        {kioskState === 'RESULT' && resultMsg && staff && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in zoom-in duration-300">
            <div className={`p-10 rounded-[2rem] max-w-sm w-full text-center shadow-2xl mx-4 flex flex-col items-center ${
              resultMsg.type === 'PRESENT' ? 'bg-[#2E7D32]' :
              resultMsg.type === 'LATE' ? 'bg-[#E65100]' :
              resultMsg.type === 'CHECKED_OUT' ? 'bg-[#185FA5]' : 'bg-[#111]'
            }`}>
              <div className="text-7xl mb-6">
                {resultMsg.type === 'PRESENT' ? '✅' : resultMsg.type === 'LATE' ? '⏰' : '👋'}
              </div>
              
              <div className="text-3xl font-bold text-white mb-2">{staff.name}</div>
              
              <div className="bg-black/20 px-6 py-2 rounded-full text-white font-bold text-2xl mb-6">
                {formatTime(currentTime).replace(/:\d{2} /, ' ')}
              </div>
              
              <div className="text-2xl font-bold text-white mb-3">{resultMsg.title}</div>
              
              <div className={`text-lg font-medium px-4 py-2 rounded-lg mb-2 ${
                resultMsg.type === 'LATE' ? 'bg-red-900/50 text-[#FFCDD2]' : 
                resultMsg.type === 'CHECKED_OUT' && resultMsg.subtitle.includes('OT') ? 'bg-blue-900/50 text-[#BBDEFB]' :
                'text-white/90'
              }`}>
                {resultMsg.subtitle}
              </div>

              {resultMsg.sub2 && (
                <div className="text-white/70 text-sm mt-4">
                  {resultMsg.sub2}
                </div>
              )}
            </div>
          </div>
        )}
        
      </div>

      {/* Bottom Stats Bar */}
      {kioskState !== 'CAMERA' && (
        <div className="flex-none bg-[#111111] border-t border-[#222] py-4 px-6 flex justify-between items-center text-sm font-medium tracking-wide">
          <div className="flex items-center space-x-2 text-gray-400">
            <span>✅</span>
            <span className="text-white">{stats.checkedIn}</span>
            <span className="hidden sm:inline">Checked in</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-400">
            <span>⏰</span>
            <span className="text-white">{stats.late}</span>
            <span className="hidden sm:inline">Late</span>
          </div>
          <div className="flex items-center space-x-2 text-gray-400">
            <span>🚪</span>
            <span className="text-white">{stats.checkedOut}</span>
            <span className="hidden sm:inline">Checked out</span>
          </div>
        </div>
      )}
    </div>
  );
}
