import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200">
          <Compass size={26} />
        </div>
        <h1 className="text-3xl font-bold text-gray-50">Page not found</h1>
        <p className="mt-3 text-gray-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-gray-950 transition-colors hover:bg-emerald-400"
          >
            Back to home
          </Link>
          <Link
            href="/sessions"
            className="rounded-lg border border-gray-700 px-5 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-white/5"
          >
            View sessions
          </Link>
        </div>
      </div>
    </div>
  );
}
