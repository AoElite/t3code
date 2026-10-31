import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import {
  mobilePreferencesAtom,
  showThreadRepositoryAndBranchAtom,
  updateMobilePreferencesAtom,
} from "../../state/preferences";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";
import { Platform } from "react-native";
import { AndroidNavigationAppearanceSection } from "./appearance/sections/AndroidNavigationAppearanceSection";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import { CodeAppearanceSection } from "./appearance/sections/CodeAppearanceSection";
import { TerminalAppearanceSection } from "./appearance/sections/TerminalAppearanceSection";
import { TextAppearanceSection } from "./appearance/sections/TextAppearanceSection";
import { ThemeAppearanceSection } from "./appearance/sections/ThemeAppearanceSection";

export function SettingsAppearanceRouteScreen() {
  const insets = useSafeAreaInsets();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const showThreadRepositoryAndBranch = useAtomValue(showThreadRepositoryAndBranchAtom);

  return (
    <SettingsScreen title="Appearance">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 18) + 18,
        }}
      >
        <ThemeAppearanceSection />
        {Platform.OS === "android" ? <AndroidNavigationAppearanceSection /> : null}
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
        <TextAppearanceSection />
        <TerminalAppearanceSection />
        <CodeAppearanceSection />
      </ScrollView>
    </SettingsScreen>
  );
}
