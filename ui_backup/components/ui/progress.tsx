"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { listen } from "@tauri-apps/api/event";

import { cn } from "./utils";

function Progress({
  className,
  value: externalValue,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    let unlistenBackendLog: (() => void) | null = null;
    let unlistenTransferProgress: (() => void) | null = null;

    const setupListeners = async () => {
      console.log("✅ Progress component: Setting up listeners...");

      // Listener per backend_log (parsing dei messaggi di log)
      unlistenBackendLog = await listen<any>("backend_log", (event) => {
        console.log("🔥 BACKEND_LOG ricevuto nel Progress component:", event);
        
        let msg = "";
        if (event.payload && typeof event.payload.message === "string") {
          msg = event.payload.message;
        } else if (typeof event.payload === "string") {
          msg = event.payload;
        } else {
          console.log("❌ Payload structure not recognized:", event.payload);
          return;
        }

        console.log("📝 Messaggio estratto dal backend_log:", JSON.stringify(msg));

        // Regex per catturare progress sia per send che receive
        const progressMatch = msg.match(/(send|recv) progress \|.*?percent=([\d.]+)/);
        console.log("🎯 Regex match result:", progressMatch);
        
        if (progressMatch) {
          const direction = progressMatch[1]; // "send" o "recv"
          const percentStr = progressMatch[2];
          const pct = parseFloat(percentStr);
          
          console.log(`📊 ${direction} progress - Raw percent: "${percentStr}"`);
          console.log(`📊 Parsed as number: ${pct}`);
          
          if (!isNaN(pct) && isFinite(pct)) {
            const intPct = Math.max(0, Math.min(100, Math.round(pct)));
            console.log(`🚀 Setting progress from backend_log to: ${intPct}%`);
            setProgress(intPct);
          } else {
            console.log("❌ Failed to parse percent as valid number");
          }
          return;
        }

        // Gestisce messaggi di completamento
        if (msg.includes("send complete") || msg.includes("recv complete")) {
          console.log("✅ Transfer completed, setting progress to 100%");
          setProgress(100);
        }
      });

      // Listener per transfer_progress (eventi strutturati)
      unlistenTransferProgress = await listen<any>("transfer_progress", (event) => {
        console.log("📈 TRANSFER_PROGRESS ricevuto nel Progress component:", event);
        
        if (event.payload && typeof event.payload.percent === "number") {
          const pct = Math.max(0, Math.min(100, Math.round(event.payload.percent)));
          console.log(`🚀 Setting progress from transfer_progress to: ${pct}%`);
          setProgress(pct);
        } else {
          console.log("❌ transfer_progress payload invalid:", event.payload);
        }
      });

      console.log("✅ Progress component: Listeners setup completed");
    };

    setupListeners();

    return () => {
      console.log("🧹 Progress component: Cleaning up listeners");
      if (unlistenBackendLog) {
        unlistenBackendLog();
        console.log("❌ backend_log listener removed");
      }
      if (unlistenTransferProgress) {
        unlistenTransferProgress();
        console.log("❌ transfer_progress listener removed");
      }
    };
  }, []);

  // Reset progress quando viene montato il componente
  React.useEffect(() => {
    console.log("🔄 Progress component mounted, resetting to 0%");
    setProgress(0);
  }, []);

  // Log ogni volta che il progress cambia
  React.useEffect(() => {
    console.log(`📊 Progress state changed to: ${progress}%`);
  }, [progress]);

  // Usa il valore esterno se fornito, altrimenti usa lo stato interno
  const currentValue = externalValue !== undefined ? externalValue : progress;

  // Debug: logga sempre il valore corrente del progress nel render
  console.log(`🎨 Progress component rendering with currentValue: ${currentValue}%`);

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className,
      )}
      value={currentValue ?? 0}
      max={100}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (currentValue ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };