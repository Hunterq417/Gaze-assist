import { motion } from "framer-motion";

function CalibrationDot({ isActive, isCompleted }) {
  const classes = isCompleted
    ? "bg-emerald-400 shadow-emerald-300/70"
    : isActive
      ? "bg-purple-500 shadow-purple-300/70"
      : "bg-white/80 shadow-slate-200/70";

  return (
    <motion.div
      animate={
        isActive
          ? { scale: [1, 1.25, 1], opacity: [0.7, 1, 0.8] }
          : { scale: 1, opacity: 1 }
      }
      transition={
        isActive
          ? { duration: 1, repeat: Infinity, ease: "easeInOut" }
          : { duration: 0.2 }
      }
      className={`mx-auto h-6 w-6 rounded-full shadow-lg ${classes}`}
    />
  );
}

export default CalibrationDot;
