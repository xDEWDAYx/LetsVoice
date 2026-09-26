import { AppSettings } from '../../settings/SettingsController';

export type SettingsPanelProps = {
  settings: AppSettings;
  disabled: boolean;
  save: (settings: AppSettings) => Promise<void>;
};
