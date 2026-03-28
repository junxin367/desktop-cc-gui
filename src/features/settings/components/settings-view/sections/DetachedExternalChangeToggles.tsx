import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/types";

type DetachedExternalChangeTogglesProps = {
  t: (key: string) => string;
  appSettings: AppSettings;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
};

export function DetachedExternalChangeToggles({
  t,
  appSettings,
  onUpdateAppSettings,
}: DetachedExternalChangeTogglesProps) {
  return (
    <>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">{t("settings.preloadGitDiffs")}</div>
          <div className="settings-toggle-subtitle">{t("settings.preloadGitDiffsDesc")}</div>
        </div>
        <Switch
          checked={appSettings.preloadGitDiffs}
          onCheckedChange={(checked) =>
            void onUpdateAppSettings({
              ...appSettings,
              preloadGitDiffs: checked,
            })
          }
        />
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">
            {t("settings.detachedExternalChangeAwareness")}
          </div>
          <div className="settings-toggle-subtitle">
            {t("settings.detachedExternalChangeAwarenessDesc")}
          </div>
        </div>
        <Switch
          checked={appSettings.detachedExternalChangeAwarenessEnabled !== false}
          onCheckedChange={(checked) =>
            void onUpdateAppSettings({
              ...appSettings,
              detachedExternalChangeAwarenessEnabled: checked,
            })
          }
        />
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">
            {t("settings.detachedExternalChangeWatcher")}
          </div>
          <div className="settings-toggle-subtitle">
            {t("settings.detachedExternalChangeWatcherDesc")}
          </div>
        </div>
        <Switch
          checked={appSettings.detachedExternalChangeWatcherEnabled !== false}
          disabled={appSettings.detachedExternalChangeAwarenessEnabled === false}
          onCheckedChange={(checked) =>
            void onUpdateAppSettings({
              ...appSettings,
              detachedExternalChangeWatcherEnabled: checked,
            })
          }
        />
      </div>
    </>
  );
}
