import { useEffect, useRef, useState } from 'react';

/** Reloj de animación en tiempo de simulación (s). Avanza `speed` s simulados por s real y hace bucle en `loopS`. */
export function useAnimationClock(playing: boolean, speed: number, loopS: number) {
  const [t, setT] = useState(0);
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = (now - last.current) / 1000;
        setT((prev) => {
          const n = prev + dt * speed;
          return n >= loopS ? n % loopS : n;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loopS]);
  return [t, setT] as const;
}
