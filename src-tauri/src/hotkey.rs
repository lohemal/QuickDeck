//! 전역 호출 단축키. 값은 프론트엔드 Settings.hotkey 에서 오며 여기에는 기본값을 두지 않는다.
//!
//! 프론트가 시작 시·설정 변경 시 `apply_hotkey` 로 넘기면 기존 등록을 풀고 새로 등록한다.
//! 새 조합 등록에 실패하면(다른 프로그램이 선점 등) **직전에 잘 되던 조합을 되살리고** 오류를 돌려주므로
//! 사용자는 단축키를 잃지 않는다. 프론트는 성공했을 때만 설정을 저장한다.

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::error::{AppError, AppResult};
use crate::window;

/// 현재 등록되어 있는 accelerator (없으면 None)
#[derive(Default)]
pub struct HotkeyState(pub Mutex<Option<String>>);

pub fn apply(app: &AppHandle, enabled: bool, accelerator: &str) -> AppResult<()> {
    let state = app.state::<HotkeyState>();
    let previous = state.0.lock().map(|s| s.clone()).unwrap_or(None);

    let gs = app.global_shortcut();
    gs.unregister_all()
        .map_err(|e| AppError::Other(format!("전역 단축키를 해제하지 못했습니다. ({e})")))?;

    if !enabled {
        set_current(app, None);
        log::info!("전역 단축키 사용 안 함");
        return Ok(());
    }

    match register(app, accelerator) {
        Ok(()) => {
            set_current(app, Some(accelerator.to_owned()));
            log::info!("전역 단축키 등록: {accelerator}");
            Ok(())
        }
        Err(e) => {
            // 새 조합이 안 되면 이전 조합을 되살린다
            if let Some(prev) = previous.as_deref() {
                if prev != accelerator {
                    match register(app, prev) {
                        Ok(()) => log::warn!("{accelerator} 등록 실패 → 이전 단축키 {prev} 복구"),
                        Err(e2) => log::error!("이전 단축키 {prev} 복구도 실패: {e2}"),
                    }
                }
            }
            Err(e)
        }
    }
}

fn register(app: &AppHandle, accelerator: &str) -> AppResult<()> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| AppError::Other(format!("단축키 형식이 올바르지 않습니다: {accelerator} ({e})")))?;

    app.global_shortcut()
        .on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Err(e) = window::toggle(app) {
                    log::warn!("전역 단축키 처리 실패: {e}");
                }
            }
        })
        .map_err(|e| {
            AppError::Other(format!(
                "{accelerator} 은(는) 등록할 수 없는 단축키입니다. 다른 프로그램이나 Windows 가 이미 사용 중일 수 있습니다. ({e})"
            ))
        })
}

fn set_current(app: &AppHandle, value: Option<String>) {
    if let Ok(mut s) = app.state::<HotkeyState>().0.lock() {
        *s = value;
    }
}
