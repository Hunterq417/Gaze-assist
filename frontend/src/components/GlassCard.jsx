function GlassCard({ children, className = "" }) {
  return (
    <section
      className={`glass-card rounded-[24px] border border-white/65 bg-white/56 p-5 shadow-[0_16px_34px_rgba(93,103,148,0.16)] backdrop-blur-xl ${className}`}
    >
      {children}
    </section>
  );
}

export default GlassCard;
