import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./ui/alert-dialog";
import { useTranslation } from "react-i18next";

export function TransferPrompt() {
  const [open, setOpen] = useState(false);
  const [transfer, setTransfer] = useState<any>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const unlistenPromise = listen("transfer_request", (event) => {
      setTransfer(event.payload);
      setOpen(true);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleResponse = async (accept: boolean) => {
    if (!transfer) return;
    await invoke("respond_transfer", {
      transfer_id: transfer.transfer_id || transfer.id,
      accept,
    });
    setOpen(false);
    setTransfer(null);
  };

  // Funzione per formattare la dimensione del file in modo leggibile (KB, MB, GB)
  function formatFileSize(bytes: number): string {
    if (bytes === 0 || !bytes) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent
        style={{
          background: "#18181b",
          color: "#f4f4f5",
          boxShadow: "0 2px 16px 0 rgba(0,0,0,0.8)",
          border: "1px solid #27272a",
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle style={{ color: "#fafafa" }}>
            {t("transfer_request_title")}
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "#d4d4d8" }}>
            {t("transfer_request_description", {
              device: transfer?.device_name || "Dispositivo",
              file: transfer?.offer?.file_name,
              size: formatFileSize(transfer?.offer?.file_size || 0),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => handleResponse(false)}
            style={{
              background: "#27272a",
              color: "#f4f4f5",
              border: "1px solid #3f3f46",
            }}
          >
            {t("reject")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleResponse(true)}
            style={{
              background: "#2563eb",
              color: "#fafafa",
              border: "1px solid #1d4ed8",
            }}
          >
            {t("accept")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
      {/* Overlay scuro */}
      <style>
        {`
          [data-state="open"] > div:first-child {
            background: rgba(24,24,27,0.85) !important;
            backdrop-filter: blur(1.5px);
          }
        `}
      </style>
    </AlertDialog>
  );
}