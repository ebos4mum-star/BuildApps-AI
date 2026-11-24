import * as Haptics from "expo-haptics";

/**
 * Light, optional tactile feedback. Failures (unsupported device, simulator) are swallowed: haptics are only
 * ever an enhancement and never gate a flow. Native behavior is not verified in this repository's CI.
 */
const safe = (fn: () => Promise<unknown>) => {
  fn().catch(() => undefined);
};
export const haptic = {
  tap: () => safe(() => Haptics.selectionAsync()),
  correct: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  wrong: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  celebrate: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
