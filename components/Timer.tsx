
import React, { useState, useEffect } from 'react';

const Timer: React.FC = () => {
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: any = null;
    if (isActive && (minutes > 0 || seconds > 0)) {
      interval = setInterval(() => {
        if (seconds === 0) {
          if (minutes > 0) {
            setMinutes(minutes - 1);
            setSeconds(59);
          }
        } else {
          setSeconds(seconds - 1);
        }
      }, 1000);
    } else if (minutes === 0 && seconds === 0) {
      setIsActive(false);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, minutes, seconds]);

  const toggle = () => setIsActive(!isActive);
  const reset = () => {
    setIsActive(false);
    setMinutes(0);
    setSeconds(0);
  };

  return (
    <div className="p-4 bg-gray-100 rounded-xl flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-xs font-bold text-gray-500 uppercase">Step Timer</span>
        <div className="text-3xl font-mono">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      </div>
      <div className="flex gap-2">
        {!isActive && (
          <div className="flex gap-1">
            <button 
              onClick={() => setMinutes(m => m + 1)} 
              className="px-3 py-2 bg-white rounded shadow text-sm min-h-[44px] flex items-center justify-center font-bold"
            >
              +M
            </button>
            <button 
              onClick={() => setMinutes(m => Math.max(0, m - 1))} 
              className="px-3 py-2 bg-white rounded shadow text-sm min-h-[44px] flex items-center justify-center font-bold"
            >
              -M
            </button>
          </div>
        )}
        <button 
          onClick={toggle} 
          className={`px-4 py-2 rounded-lg font-bold text-white min-h-[44px] ${isActive ? 'bg-red-500' : 'bg-green-500'}`}
        >
          {isActive ? 'Stop' : 'Start'}
        </button>
      </div>
    </div>
  );
};

export default Timer;
