const SHARDS = [
  { top: "8%", left: "6%", size: 46, rot: -12, color: "#ff5cad", anim: "animate-float-slow", delay: "0s" },
  { top: "18%", left: "88%", size: 34, rot: 20, color: "#33c7ff", anim: "animate-float-med", delay: "0.6s" },
  { top: "62%", left: "3%", size: 30, rot: 8, color: "#ffcf40", anim: "animate-float-med", delay: "1.1s" },
  { top: "78%", left: "92%", size: 52, rot: -18, color: "#8b6dff", anim: "animate-float-slow", delay: "0.3s" },
  { top: "40%", left: "95%", size: 22, rot: 30, color: "#2bd6a8", anim: "animate-float-med", delay: "1.6s" },
  { top: "88%", left: "20%", size: 26, rot: -25, color: "#ff5cad", anim: "animate-float-slow", delay: "2s" },
];

/** Fixed, decorative floating crystal shards drifting behind the page content. Purely visual. */
export default function CrystalField() {
  return (
    <div aria-hidden className="fixed inset-0 z-0 overflow-hidden">
      {SHARDS.map((shard, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`crystal-shard ${shard.anim} opacity-40`}
          style={{
            top: shard.top,
            left: shard.left,
            width: shard.size,
            height: shard.size,
            animationDelay: shard.delay,
            ["--float-rot" as string]: `${shard.rot}deg`,
            transform: `rotate(${shard.rot}deg)`,
          }}
        >
          <path d="M12 1 L21 8.5 L17 23 L7 23 L3 8.5 Z" fill={shard.color} opacity="0.55" />
          <path d="M12 1 L21 8.5 L12 12 Z" fill="#fff" opacity="0.5" />
        </svg>
      ))}
    </div>
  );
}
