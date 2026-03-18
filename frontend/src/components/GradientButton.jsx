import { motion } from "framer-motion";

function GradientButton({
  children,
  className = "",
  variant = "solid",
  type = "button",
  ...props
}) {
  const baseClass =
    "rounded-full px-5 py-2.5 text-sm font-semibold tracking-[0.01em] transition-all duration-300";
  const variants = {
    solid:
      "bg-gradient-to-r from-[#6d56de] to-[#7043d8] text-white shadow-[0_10px_18px_rgba(103,76,213,0.35)]",
    subtle:
      "border border-white/70 bg-white/72 text-slate-700 shadow-[0_8px_18px_rgba(97,99,151,0.12)] hover:bg-white/88",
  };

  return (
    <motion.button
      type={type}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.98 }}
      className={`${baseClass} ${variants[variant] ?? variants.solid} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export default GradientButton;
