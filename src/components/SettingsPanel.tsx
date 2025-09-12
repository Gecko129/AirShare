import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

type SettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="bg-slate-900 border-r border-slate-800 text-white p-4 w-full sm:max-w-sm data-[state=open]:animate-slide-in-from-left data-[state=closed]:animate-slide-out-to-left"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-white text-3xl text-center bg-transparent">{t("settings")}</SheetTitle>
        </SheetHeader>

        {/* Contenuto pannello */}
        <div className="mt-2 space-y-6">
          <div className="flex justify-center">
            <LanguageSwitcher embedded />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
