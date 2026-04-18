import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';

/**
 * 🔄 Premium PullToRefresh
 * Optimized for 60FPS using useMotionValue and useTransform.
 * Masks reloads with a theme-colored "Shadow Veil" to eliminate white flashes.
 */
export default function PullToRefresh({ onRefresh, children }) {
  // Use MotionValue for the most performant, direct DOM manipulation
  const mvDistance = useMotionValue(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const startY = useRef(0);
  const isAtTop = useRef(true);
  const THRESHOLD = 140;

  // Derived animations (GPU-driven)
  const indicatorY = useTransform(mvDistance, [0, THRESHOLD], [-60, 40]);
  const indicatorScale = useTransform(mvDistance, [0, THRESHOLD], [0.5, 1.1]);
  const indicatorOpacity = useTransform(mvDistance, [0, 80], [0, 1]);
  const indicatorRotate = useTransform(mvDistance, [0, THRESHOLD], [0, 400]);
  const contentY = useTransform(mvDistance, d => d * 0.45);
  const backdropBlur = useTransform(mvDistance, [0, THRESHOLD], [0, 12]);

  const handleTouchStart = (e) => {
    const scrollContainer = document.querySelector('main');
    isAtTop.current = !scrollContainer || scrollContainer.scrollTop === 0;
    
    if (isAtTop.current && !isRefreshing) {
      startY.current = e.touches[0].pageY;
    }
  };

  const handleTouchMove = (e) => {
    if (!isAtTop.current || isRefreshing) return;

    const currentY = e.touches[0].pageY;
    const distance = currentY - startY.current;

    if (distance > 0) {
      // Logarithmic dampened feel
      const d = Math.min(distance * 0.4, THRESHOLD + 20);
      mvDistance.set(d);
      
      // Stop browser native pull-to-refresh
      if (distance > 5 && e.cancelable) {
        e.preventDefault();
      }
    }
  };

  const handleTouchEnd = useCallback(async () => {
    if (isRefreshing) return;

    const finalDistance = mvDistance.get();
    
    if (finalDistance >= THRESHOLD) {
      setIsRefreshing(true);
      // "Snap" to threshold
      mvDistance.set(THRESHOLD);
      
      try {
        await onRefresh();
      } catch (err) {
        console.error("Refresh Logic Error:", err);
      }
    } else {
      // Snap back to zero
      mvDistance.set(0);
    }
  }, [isRefreshing, onRefresh, mvDistance]);

  useEffect(() => {
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchEnd]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-transparent">
      {/* 🌫️ Dynamic Blur Overlay (Intensifies with pull) */}
      <motion.div 
        className="absolute inset-0 z-40 pointer-events-none"
        style={{ backdropFilter: useTransform(backdropBlur, b => `blur(${b}px)`) }}
      />

      {/* 🔮 Pull Indicator (The Spinning V) */}
      <motion.div 
        className="absolute top-0 left-0 right-0 flex justify-center z-[100] pointer-events-none"
        style={{ 
          opacity: indicatorOpacity,
          y: indicatorY,
          scale: indicatorScale
        }}
      >
        <div className="relative flex flex-col items-center">
          {/* High-Reflective Brand Ring */}
          <motion.div 
            className="w-14 h-14 rounded-full border-2 border-white/10 flex items-center justify-center bg-theme-card/80 backdrop-blur-2xl shadow-[0_0_30px_rgba(56,189,248,0.1)]"
            style={{ rotate: indicatorRotate }}
            animate={isRefreshing ? { rotate: 360 } : {}}
            transition={isRefreshing ? { repeat: Infinity, duration: 0.8, ease: "linear" } : { type: "spring", stiffness: 150 }}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-black text-xs shadow-inner">
              V
            </div>
          </motion.div>
          
          <motion.div 
            className="mt-3 flex flex-col items-center gap-1"
            animate={{ opacity: mvDistance.get() > THRESHOLD ? 1 : 0.6 }}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-400">
              {isRefreshing ? 'Resetting Nodes...' : 
               mvDistance.get() > THRESHOLD ? 'Release to Reboot' : 'Pull to Refresh'}
            </p>
            <div className="w-12 h-0.5 bg-sky-400/20 rounded-full overflow-hidden">
                <motion.div 
                    className="h-full bg-sky-400"
                    style={{ width: useTransform(mvDistance, [0, THRESHOLD], ["0%", "100%"]) }}
                />
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* 🎭 THE SHADOW VEIL (Eliminates the White Flash) */}
      <AnimatePresence>
        {isRefreshing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#020617] flex flex-col items-center justify-center"
          >
            <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="flex flex-col items-center gap-6"
            >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400/20 to-blue-600/20 border border-white/10 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-black text-lg">V</div>
                </div>
                <div className="text-center">
                    <h2 className="text-white font-black text-sm uppercase tracking-[0.3em] mb-2 text-glow-blue">System Synchronizing</h2>
                    <p className="text-sky-400/60 font-medium text-[10px] uppercase tracking-widest animate-pulse">Recompressing Neural Mesh...</p>
                </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🏗️ Application Port (Slight parallax drift) */}
      <motion.div 
        className="w-full h-full"
        style={{ y: contentY }}
      >
        {children}
      </motion.div>
    </div>
  );
}
