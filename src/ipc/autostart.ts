import { isTauri } from '@tauri-apps/api/core'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'

/**
 * Windows 시작 시 자동 실행 (tauri-plugin-autostart → HKCU\...\Run 레지스트리).
 * 설정값(settings.window.autoStart)이 기준이고, 시작 시 실제 등록 상태와 맞춘다.
 * 자동 실행으로 시작되면 `--autostart` 인자가 붙어 창을 띄우지 않고 트레이로만 시작한다.
 */
export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false
  return isEnabled()
}

export async function setAutostart(on: boolean): Promise<void> {
  if (!isTauri()) return
  if (on) await enable()
  else await disable()
}
