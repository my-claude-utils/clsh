import { useState, useEffect } from 'react';
import { TrafficLights } from './TrafficLights';

/**
 * macOS-style menu bar at the top of the screen area.
 * Includes traffic lights on the far left, menu items, and a live clock on the right.
 */
export function MenuBar() {
  const [time, setTime] = useState(() => formatTime(new Date()));

  useEffect(() => {
    // Update the clock every 15 seconds to keep it reasonably fresh
    const interval = setInterval(() => {
      setTime(formatTime(new Date()));
    }, 15_000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex h-6 shrink-0 items-center justify-between bg-[#1a1a1a] px-3 font-mono text-[11px] text-neutral-400">
      {/* Left: traffic lights + menu items */}
      <div className="flex items-center gap-4">
        <TrafficLights />
        <div className="flex items-center gap-3">
          {/* Apple logo */}
          <span className="text-xs text-neutral-300"></span>
          <span className="font-semibold text-neutral-300">clsh</span>
          <span>File</span>
          <span>Edit</span>
          <span>View</span>
          <span>Terminal</span>
        </div>
      </div>

      {/* Right: clock */}
      <span className="tabular-nums">{time}</span>
    </div>
  );
}

/** Format a Date into macOS menu bar style: "Thu Mar 12 2:30 PM" */
function formatTime(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const day = days[date.getDay()];
  const month = months[date.getMonth()];
  const dateNum = date.getDate();

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const minuteStr = minutes.toString().padStart(2, '0');

  return `${day} ${month} ${dateNum} ${hours}:${minuteStr} ${ampm}`;
}
