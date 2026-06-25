"use client";

import { motion } from "framer-motion";
import useSWR from "swr";
import SampleReport from "@/components/landing/SampleReport";
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

      {/* Sample Report */}
      <motion.div {...fadeInUp}>
        <SampleReport />
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
        <section id="form" className="px-4 py-14 sm:px-6 sm:py-24">
          <div className="max-w-2xl mx-auto">
            <h2 className="mb-3 text-center text-2xl font-bold text-[var(--text-primary)] sm:mb-4 sm:text-3xl">
              Start a new review
            </h2>
            <p className="mb-6 text-center text-sm text-[var(--text-secondary)] sm:mb-10 sm:text-base">
              Paste a repo, pick what to check, get results.
            </p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 md:p-8">
              <NewSessionForm />
            </div>
          </div>
        </section>
      </motion.div>

      {/* Recent Sessions */}
      {!isLoading && sessions.length > 0 && (
        <motion.div {...fadeInUp}>
          <section className="px-4 pb-14 sm:px-6 sm:pb-24">
            <div className="max-w-2xl mx-auto">
              <SessionList sessions={sessions} />
            </div>
          </section>
        </motion.div>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--border)] px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-[var(--text-secondary)]">RepoScope</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>File-level findings</span>
              <span className="text-gray-700">&bull;</span>
              <span>Evidence-backed fixes</span>
              <span className="text-gray-700">&bull;</span>
              <span>Powered by AI agents</span>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Built with Next.js, Prisma, and Zod.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
