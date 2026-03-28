import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HorizontalScrollAreaProps {
  children: React.ReactNode;
  className?: string;
}

const HorizontalScrollArea: React.FC<HorizontalScrollAreaProps> = ({ children, className = "" }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeft(scrollLeft > 10);
      setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      checkScroll();
      
      // Initial check after content might have rendered
      const timeout = setTimeout(checkScroll, 500);
      
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        clearTimeout(timeout);
      };
    }
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth * 0.75;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className={`relative group ${className}`}>
      {showLeft && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/80 backdrop-blur-md border border-[#C8A862]/30 rounded-full text-[#C8A862] shadow-2xl flex items-center justify-center active:scale-95 transition-all hover:bg-[#C8A862] hover:text-black"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide"
        onScroll={checkScroll}
      >
        {children}
      </div>

      {showRight && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 bg-black/80 backdrop-blur-md border border-[#C8A862]/30 rounded-full text-[#C8A862] shadow-2xl flex items-center justify-center active:scale-95 transition-all hover:bg-[#C8A862] hover:text-black"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default HorizontalScrollArea;
