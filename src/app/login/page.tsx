"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";
import BrandLogo from "@/components/brand/brand-logo";

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 flex flex-col items-center gap-4">
          <BrandLogo variant="login" showProduct={false} className="justify-center" />
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-1">AlgoTrader</h1>
            <p className="text-sm uppercase tracking-[0.25em] text-text-tertiary">
              Indian market algo trading
            </p>
            <p className="text-xs text-text-secondary mt-2">
              Powered by Agrasen Technologies
            </p>
          </div>
        </div>

        <div className="card glow-accent">
          <h2 className="text-xl font-semibold text-text-primary text-center mb-2">
            Welcome back
          </h2>
          <p className="text-text-secondary text-center text-sm mb-8">
            Sign in to access your trading dashboard
          </p>

          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg
                       bg-bg-secondary hover:bg-bg-hover text-text-primary font-medium text-sm
                       transition-all duration-200 shadow-md cursor-pointer ring-1 ring-border"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          <div className="mt-6 pt-6 border-t border-border">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-accent">430+</p>
                <p className="text-xs text-text-tertiary">NSE Stocks</p>
              </div>
              <div>
                <p className="text-lg font-bold text-accent">5</p>
                <p className="text-xs text-text-tertiary">Strategies</p>
              </div>
              <div>
                <p className="text-lg font-bold text-accent">Live</p>
                <p className="text-xs text-text-tertiary">Zerodha</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] uppercase tracking-[0.2em] text-text-tertiary mt-6">
          Agrasen Technologies &middot; IT consulting services
        </p>
      </div>
    </div>
  );
}
