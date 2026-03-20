'use client';

import { useEffect, useState } from 'react';

export default function GuestBadge({
  expiresAt,
}: {
  expiresAt: string;
}) {
  const [timeLeft, setTimeLeft] = useState('');
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    function update() {
      const now = new Date();
      const expiry = new Date(expiresAt);
      const diffMs = expiry.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft('expired');
        setUrgent(true);
        return;
      }

      const diffMin = Math.floor(diffMs / 60000);
      const hours = Math.floor(diffMin / 60);
      const mins = diffMin % 60;

      setUrgent(diffMin < 30);

      if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m`);
      } else {
        setTimeLeft(`${mins}m`);
      }
    }

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        urgent
          ? 'bg-red-500/20 text-red-200'
          : 'bg-amber-500/20 text-amber-200'
      }`}
    >
      Guest — {timeLeft} left
    </span>
  );
}
