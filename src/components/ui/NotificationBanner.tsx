"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Info, CheckCircle, AlertTriangle, ArrowRight, X } from "lucide-react";
import { useState } from "react";

interface NotificationBannerProps {
  type: "info" | "success" | "warning" | "action";
  message: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
}

const typeConfig = {
  info: {
    icon: Info,
    bgClass: "bg-emerald-950/70 border-emerald-700/50",
    textClass: "text-emerald-300",
    iconColor: "text-emerald-400",
  },
  success: {
    icon: CheckCircle,
    bgClass: "bg-green-950/80 border-green-700/50",
    textClass: "text-green-300",
    iconColor: "text-green-400",
  },
  warning: {
    icon: AlertTriangle,
    bgClass: "bg-yellow-950/80 border-yellow-700/50",
    textClass: "text-yellow-300",
    iconColor: "text-yellow-400",
  },
  action: {
    icon: ArrowRight,
    bgClass: "bg-emerald-950/70 border-emerald-700/50",
    textClass: "text-emerald-300",
    iconColor: "text-emerald-400",
  },
};

export default function NotificationBanner({
  type,
  message,
  action,
  dismissible = false,
}: NotificationBannerProps) {
  const [visible, setVisible] = useState(true);
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className={`w-full px-4 py-3 border rounded-lg flex items-center gap-3 ${config.bgClass}`}
        >
          <Icon size={18} className={config.iconColor} />
          <span className={`flex-1 text-sm ${config.textClass}`}>{message}</span>
          {action && (
            <button
              onClick={action.onClick}
              className="px-3 py-1 text-xs font-medium rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              {action.label}
            </button>
          )}
          {dismissible && (
            <button
              onClick={() => setVisible(false)}
              className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
