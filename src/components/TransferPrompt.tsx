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
  const [trustDevice, setTrustDevice] = useState(false);
  const { t } = useTranslation();

  // Normalizza il nome del dispositivo come in DeviceDetection
  const normalizeDeviceName = (payload: any): string => {
    // Prova diversi campi dove potrebbe essere il nome
    const nameCandidate = 
      payload?.device_name || 
      payload?.sender || 
      payload?.from_device || 
      payload?.remote_name ||
      payload?.device ||
      payload?.ip ||
      "Dispositivo";

    // Se è un IP (es. "192.168.1.100"), mantienilo così
    if (/^\d+\.\d+\.\d+\.\d+$/.test(nameCandidate)) {
      return nameCandidate;
    }

    // Normalizza il nome usando la stessa logica di DeviceDetection
    const lower = String(nameCandidate).toLowerCase();
    let type = 'other';
    
    if (lower.includes('iphone') || lower.includes('ipad') || lower.includes('ios')) type = 'iphone';
    else if (lower.includes('android')) type = 'android';
    else if (lower.includes('mac') || lower.includes('macbook') || lower.includes('darwin')) type = 'macos';
    else if (lower.includes('win') || lower.includes('windows')) type = 'windows';
    else if (lower.includes('linux')) type = 'linux';

    // Ritorna il nome normalizzato
    return nameCandidate || "Dispositivo";
  };

  useEffect(() => {
    const unlistenPromise = listen("transfer_request", (event) => {
      console.log("📦 [TransferPrompt] Evento ricevuto:", event.payload);
      setTransfer(event.payload);
      setOpen(true);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleResponse = async (accept: boolean) => {
  if (!transfer) return;
  try {
    // Estrai l'IP dal payload dell'evento
    const senderIp = transfer.ip || transfer.sender_ip;
    
    await invoke("respond_transfer", {
      args: {
        transfer_id: transfer.offer?.transfer_id || transfer.transfer_id || transfer.id,
        accept,
        trust: trustDevice,
      },
    });
  } catch (error) {
    console.error("Errore durante la risposta al trasferimento:", error);
  } finally {
    setOpen(false);
    setTransfer(null);
    setTrustDevice(false);
  }
};

  function formatFileSize(bytes: number): string {
    if (bytes === 0 || !bytes) return "0 KB";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }

  const deviceName = normalizeDeviceName(transfer || {});

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
              device: deviceName,
              file: transfer?.offer?.file_name,
              size: formatFileSize(transfer?.offer?.file_size || 0),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* Trust device checkbox */}
        <div className="flex items-center gap-2 mt-3">
          <input
            id="trust-device"
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
          />
          <label htmlFor="trust-device" className="text-sm text-zinc-300">
            {t("trust_device_checkbox", "Ricorda e considera attendibile questo dispositivo")}
          </label>
        </div>
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
