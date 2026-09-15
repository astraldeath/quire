import { isTauri } from '@tauri-apps/api/core';
import { impactFeedback } from '@tauri-apps/plugin-haptics';
/** Feedback is best effort: unsupported hardware must never delay the menu. */
export function holdFeedback(): void {
  if (isTauri()) void impactFeedback('light').catch(() => {});
}
