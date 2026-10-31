import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";

import {
  mobilePreferencesAtom,
  showThreadRepositoryAndBranchAtom,
  updateMobilePreferencesAtom,
} from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";
import { SettingsSwitchRow } from "../../components/SettingsSwitchRow";

export function ThreadListAppearanceSection() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const showThreadRepositoryAndBranch = useAtomValue(showThreadRepositoryAndBranchAtom);

  return (
    <SettingsSection title="Thread list">
      <SettingsSwitchRow
        icon="arrow.triangle.branch"
        label="Show repository and branch"
        subtitle="Display repository and Git branch names in thread cards on this device."
        disabled={!preferencesReady}
        value={showThreadRepositoryAndBranch}
        onValueChange={(value) => savePreferences({ showThreadRepositoryAndBranch: value })}
      />
    </SettingsSection>
  );
}
