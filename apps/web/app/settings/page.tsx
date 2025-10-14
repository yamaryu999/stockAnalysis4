import { loadWeights } from "@kabu4/core";
import SettingsForm from "@/components/settings/settings-form";
import { t } from "@/lib/i18n";

export default function SettingsPage() {
  const weights = loadWeights();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("settings.heading")}</h2>
        <p className="text-sm text-slate-400">{t("settings.description")}</p>
      </div>
      <SettingsForm defaults={weights} />
    </div>
  );
}
