export default function SkeletonLoader({ status = "Connecting..." }) {
  const items = [1, 2, 3]; // Show 3 skeleton cards

  return (
    <div className="flex flex-col gap-1 w-full">
      {items.map((i, index) => (
        <div 
          key={i} 
          className={`flex items-center justify-between py-3 border-white/5 ${index !== items.length - 1 ? 'border-b' : ''} animate-pulse`}
          style={{ animationDuration: '1s', animationDelay: `${index * 150}ms` }}
        >
          <div className="flex items-center gap-3">
            {/* Avatar Skeleton */}
            <div className="w-14 h-14 rounded-full bg-white/10" />
            
            {/* Text Skeleton */}
            <div className="flex flex-col gap-2">
              <div className="w-24 h-4 bg-white/10 rounded" />
              <div className="w-16 h-3 bg-white/5 rounded" />
            </div>
          </div>
          
          {/* Icon Skeleton */}
          <div className="w-8 h-8 rounded-full bg-white/5" />
        </div>
      ))}
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
         <div className="bg-[#4A3080]/90 px-5 py-2.5 rounded-full backdrop-blur-md border border-white/10 shadow-2xl flex items-center gap-3 animate-[pulse_1.5s_ease-in-out_infinite]">
            <div className="w-4 h-4 border-2 border-white/20 border-t-emerald-400 rounded-full animate-[spin_0.8s_linear_infinite]" />
            <span className="text-sm font-semibold text-white tracking-wide">{status}</span>
         </div>
      </div>
    </div>
  );
}
