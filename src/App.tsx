import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';

type Mode = 'focus' | 'shortBreak' | 'longBreak';

interface Settings {
  focus: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
}

interface SessionRecord {
  date: string;
  completedSessions: number;
  totalFocusSeconds: number;
}

const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
};

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function App() {
  const [settings, setSettings] = useLocalStorage<Settings>('pomodoro-settings', DEFAULT_SETTINGS);
  const [sessions, setSessions] = useLocalStorage<Record<string, SessionRecord>>('pomodoro-sessions', {});
  
  const [mode, setMode] = useState<Mode>('focus');
  const [timeLeft, setTimeLeft] = useState(settings.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedInCycle, setCompletedInCycle] = useLocalStorage<number>('pomodoro-cycle', 0);
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<Settings>(settings);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleTimerCompleteRef = useRef<() => void>(() => {});

  const totalTime = mode === 'focus' ? settings.focus * 60 :
                    mode === 'shortBreak' ? settings.shortBreak * 60 :
                    settings.longBreak * 60;

  const progress = ((totalTime - timeLeft) / totalTime) * 100;

  const playNotification = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      setTimeout(() => {
        oscillator.frequency.value = 1000;
      }, 150);
      setTimeout(() => {
        oscillator.frequency.value = 1200;
      }, 300);
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 500);
    } catch {
      // Audio not supported
    }
  };

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    
    if (mode === 'focus') {
      const todayKey = getTodayKey();
      setSessions(prev => {
        const existing = prev[todayKey] || { date: todayKey, completedSessions: 0, totalFocusSeconds: 0 };
        return {
          ...prev,
          [todayKey]: {
            ...existing,
            completedSessions: existing.completedSessions + 1,
            totalFocusSeconds: existing.totalFocusSeconds + settings.focus * 60,
          }
        };
      });
      
      const newCycleCount = completedInCycle + 1;
      setCompletedInCycle(newCycleCount);
      
      playNotification();
      
      if (newCycleCount % settings.longBreakInterval === 0) {
        setMode('longBreak');
        setTimeLeft(settings.longBreak * 60);
      } else {
        setMode('shortBreak');
        setTimeLeft(settings.shortBreak * 60);
      }
    } else {
      playNotification();
      setMode('focus');
      setTimeLeft(settings.focus * 60);
    }
  }, [mode, settings, completedInCycle]);

  // Keep ref updated with latest handler
  useEffect(() => {
    handleTimerCompleteRef.current = handleTimerComplete;
  }, [handleTimerComplete]);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimerCompleteRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeLeft(totalTime);
  };

  const handleModeChange = (newMode: Mode) => {
    setIsRunning(false);
    setMode(newMode);
    const time = newMode === 'focus' ? settings.focus * 60 :
                 newMode === 'shortBreak' ? settings.shortBreak * 60 :
                 settings.longBreak * 60;
    setTimeLeft(time);
  };

  const handleSaveSettings = () => {
    setSettings(tempSettings);
    setShowSettings(false);
    // Reset timer if not running
    if (!isRunning) {
      const time = mode === 'focus' ? tempSettings.focus * 60 :
                   mode === 'shortBreak' ? tempSettings.shortBreak * 60 :
                   tempSettings.longBreak * 60;
      setTimeLeft(time);
    }
  };

  const todayKey = getTodayKey();
  const todayStats = sessions[todayKey] || { date: todayKey, completedSessions: 0, totalFocusSeconds: 0 };
  const todayMinutes = Math.round(todayStats.totalFocusSeconds / 60);

  const modeColors = {
    focus: { bg: 'from-rose-500 to-orange-500', ring: 'stroke-rose-400', text: 'text-rose-500', light: 'bg-rose-50', btn: 'bg-rose-500 hover:bg-rose-600' },
    shortBreak: { bg: 'from-emerald-500 to-teal-500', ring: 'stroke-emerald-400', text: 'text-emerald-500', light: 'bg-emerald-50', btn: 'bg-emerald-500 hover:bg-emerald-600' },
    longBreak: { bg: 'from-blue-500 to-indigo-500', ring: 'stroke-blue-400', text: 'text-blue-500', light: 'bg-blue-50', btn: 'bg-blue-500 hover:bg-blue-600' },
  };

  const colors = modeColors[mode];
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradient decoration */}
      <div className={`absolute top-0 left-0 right-0 h-64 bg-gradient-to-br ${colors.bg} opacity-10 transition-all duration-700`}></div>
      
      <div className="relative z-10 w-full max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center justify-center gap-2">
            <span className="text-2xl">🍅</span>
            Pomodoro Focus
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Stay focused, one session at a time</p>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-8 bg-white rounded-2xl p-2 shadow-sm border border-gray-100">
          {([
            { key: 'focus' as Mode, label: 'Focus', icon: '🎯' },
            { key: 'shortBreak' as Mode, label: 'Short Break', icon: '☕' },
            { key: 'longBreak' as Mode, label: 'Long Break', icon: '🌿' },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => handleModeChange(key)}
              className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                mode === key
                  ? `bg-gradient-to-r ${colors.bg} text-white shadow-md`
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="mr-1">{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Timer Circle */}
        <div className="flex justify-center mb-8">
          <div className="relative w-64 h-64">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 260 260">
              {/* Background circle */}
              <circle
                cx="130"
                cy="130"
                r="120"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              {/* Progress circle */}
              <circle
                cx="130"
                cy="130"
                r="120"
                fill="none"
                className={`${colors.ring} transition-all duration-1000`}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            {/* Timer text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-mono font-bold text-gray-800 tracking-wider">
                {formatTime(timeLeft)}
              </span>
              <span className={`text-sm font-medium mt-2 ${colors.text}`}>
                {mode === 'focus' ? 'Focus Time' : mode === 'shortBreak' ? 'Short Break' : 'Long Break'}
              </span>
              <span className="text-xs text-gray-400 mt-1">
                Session {completedInCycle % settings.longBreakInterval + 1} of {settings.longBreakInterval}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all shadow-sm"
            title="Reset"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          
          <button
            onClick={isRunning ? handlePause : handleStart}
            className={`w-16 h-16 rounded-full bg-gradient-to-r ${colors.btn} text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all transform hover:scale-105 active:scale-95`}
            title={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => { setTempSettings(settings); setShowSettings(true); }}
            className="w-12 h-12 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-all shadow-sm"
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Today's Stats */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Today's Progress
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{todayStats.completedSessions}</div>
              <div className="text-xs text-gray-500 mt-1">Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{todayMinutes}</div>
              <div className="text-xs text-gray-500 mt-1">Minutes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{completedInCycle % settings.longBreakInterval}/{settings.longBreakInterval}</div>
              <div className="text-xs text-gray-500 mt-1">Cycle</div>
            </div>
          </div>
          
          {/* Session dots */}
          <div className="flex justify-center gap-2 mt-4">
            {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < (completedInCycle % settings.longBreakInterval)
                    ? `bg-gradient-to-r ${colors.bg}`
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowSettings(false)}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <span>⚙️</span> Settings
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1 block">Focus Duration (min)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={tempSettings.focus}
                  onChange={e => setTempSettings(prev => ({ ...prev, focus: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-rose-400 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-gray-800"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1 block">Short Break (min)</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={tempSettings.shortBreak}
                  onChange={e => setTempSettings(prev => ({ ...prev, shortBreak: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-gray-800"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1 block">Long Break (min)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={tempSettings.longBreak}
                  onChange={e => setTempSettings(prev => ({ ...prev, longBreak: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-800"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600 mb-1 block">Sessions before Long Break</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={tempSettings.longBreakInterval}
                  onChange={e => setTempSettings(prev => ({ ...prev, longBreakInterval: Math.max(2, Math.min(10, parseInt(e.target.value) || 4)) }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-gray-800"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-medium hover:shadow-lg transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
