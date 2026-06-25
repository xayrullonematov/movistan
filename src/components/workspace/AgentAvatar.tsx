"use client";

import { Code2, Shield, Zap, Users } from "lucide-react";
import type { AgentType } from "@/types/domain";

interface AgentAvatarProps {
  agent: AgentType;
  size?: "sm" | "md" | "lg";
  isActive?: boolean;
  isSpeaking?: boolean;
}

const agentConfig: Record<
  AgentType,
  { icon: typeof Code2; color: string; bgColor: string; glowColor: string }
> = {
  "senior-engineer": {
    icon: Code2,
    color: "#14b8a6",
    bgColor: "bg-emerald-500/15",
    glowColor: "shadow-emerald-500/40",
  },
  "security-engineer": {
    icon: Shield,
    color: "#ef4444",
    bgColor: "bg-red-500/20",
    glowColor: "shadow-red-500/50",
  },
  "performance-engineer": {
    icon: Zap,
    color: "#f59e0b",
    bgColor: "bg-amber-500/20",
    glowColor: "shadow-amber-500/50",
  },
  "product-engineer": {
    icon: Users,
    color: "#38bdf8",
    bgColor: "bg-cyan-500/15",
    glowColor: "shadow-cyan-500/40",
  },
};

const sizeMap = {
  sm: { container: 32, icon: 16 },
  md: { container: 48, icon: 24 },
  lg: { container: 64, icon: 32 },
};

export default function AgentAvatar({
  agent,
  size = "md",
  isActive = false,
  isSpeaking = false,
}: AgentAvatarProps) {
  const config = agentConfig[agent];
  const dimensions = sizeMap[size];
  const Icon = config.icon;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full ${config.bgColor} ${
        isSpeaking
          ? `scale-110 shadow-lg ${config.glowColor}`
          : ""
      } ${
        isActive ? "animate-[pulse-glow_2s_ease-in-out_infinite]" : ""
      } transition-transform duration-300 ease-out`}
      style={{
        width: dimensions.container,
        height: dimensions.container,
        color: config.color,
        borderWidth: 2,
        borderColor: config.color,
        borderStyle: "solid",
      }}
      aria-label={`${agent} avatar`}
    >
      <Icon size={dimensions.icon} strokeWidth={2} />
      {isActive && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-30"
          style={{ borderWidth: 2, borderColor: config.color, borderStyle: "solid" }}
        />
      )}
    </div>
  );
}
