import { AnimatePresence, motion } from "framer-motion";
import { Outlet, useLocation } from "react-router-dom";
import { normal } from "../lib/animationConfig";

export function AnimatedOutlet() {
  const location = useLocation();
  const isMap = location.pathname === "/map";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={normal}
        className={
          isMap ? "flex h-full min-h-0 min-w-0 flex-1 flex-col" : "min-h-0 min-w-0 flex-1"
        }
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  );
}
