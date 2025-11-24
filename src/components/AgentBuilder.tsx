import React from "react";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

interface AgentBuilderProps {
  walletAddress: string;
  privateKey: string;
  onDeploy?: () => void;
}

export const AgentBuilder = (_props: AgentBuilderProps) => {
  return (
    <div className="h-full w-full flex items-center justify-center bg-[#05070a]">
      <div className="max-w-xl w-full mx-auto rounded-2xl bg-[#080b12] border border-zinc-800/60 p-8 text-center">
        <h2 className="text-2xl font-semibold text-zinc-100 mb-2">Coming soon</h2>
        <p className="text-sm text-zinc-400 mb-6">
          We&apos;re building a simple, powerful wizard to create and deploy AI trading agents.
        </p>
        <div className="text-xs text-zinc-500">Stay tuned for updates.</div>
      </div>
    </div>
  );
};
