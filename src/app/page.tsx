"use client";

import { motion } from "framer-motion";
import useSWR from "swr";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorks from "@/components/landing/HowItWorks";
import AgentShowcase from "@/components/landing/AgentShowcase";
import NewSessionForm from "@/components/session/NewSessionForm";
import SessionList from "@/components/session/SessionList";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: "easeOut" as const },
};

export default function Home() {
  const { data, isLoading } = useSWR("/api/sessions", fetcher);
  const sessions = data?.sessions ?? [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <motion.div {...fadeInUp}>
        <HeroSection />
      </motion.div>

      {/* How It Works */}
      <motion.div {...fadeInUp}>
        <HowItWorks />
      </motion.div>

      {/* Agent Showcase */}
      <motion.div {...fadeInUp}>
        <AgentShowcase />
      </motion.div>

      {/* Start Session Form */}
      <motion.div {...fadeInUp}>
        <section id="form" className="py-24 px-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-50 text-center mb-4">
              Start a Debate
            </h2>
            <p className="text-gray-400 text-center mb-10">
              Describe your engineering problem and let the agents find the best solution.
            </p>
            <div className="p-6 md:p-8 rounded-xl bg-gray-900 border border-gray-700">
              <NewSessionForm />
            </div>
          </div>
        </section>
      </motion.div>

      {/* Recent Sessions */}
      {!isLoading && sessions.length > 0 && (
        <motion.div {...fadeInUp}>
          <section className="pb-24 px-6">
            <div className="max-w-2xl mx-auto">
              <SessionList sessions={sessions} />
            </div>
          </section>
        </motion.div>
      )}
    </div>
  );
}
