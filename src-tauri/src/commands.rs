//! Tauri IPC 명령. 얇게 유지한다 — 인자 받아서 모듈 함수 부르고 결과만 돌려준다.

use serde::Serialize;
use tauri::AppHandle;

use crate::actions;
use crate::error::AppResult;
use crate::hotkey;
use crate::model::Action;
use crate::store;
use crate::window::{self, PlacementInfo, WindowPrefs};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    version: String,
    data_dir: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppResult<AppInfo> {
    let path = store::data_file(&app)?;
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: path.parent().map(|p| p.display().to_string()).unwrap_or_default(),
    })
}

/// 저장된 JSON 텍스트. 파일이 없으면 null.
#[tauri::command]
pub fn load_app_data(app: AppHandle) -> AppResult<Option<String>> {
    store::load(&app)
}

#[tauri::command]
pub fn save_app_data(app: AppHandle, json: String) -> AppResult<()> {
    store::save(&app, &json)
}

#[tauri::command]
pub fn execute_action(action: Action) -> AppResult<()> {
    actions::execute(&action).map_err(|e| {
        log::warn!("실행 실패: {e} ({action:?})");
        e.into()
    })
}

// ── 창 ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn show_deck(app: AppHandle) -> AppResult<()> {
    window::show(&app)
}

#[derive(Serialize)]
pub struct LaunchInfo {
    autostart: bool,
}

/// 프론트가 첫 표시 여부를 정할 때 쓴다
#[tauri::command]
pub fn launch_info() -> LaunchInfo {
    LaunchInfo {
        autostart: crate::launched_by_autostart(),
    }
}

#[tauri::command]
pub fn hide_deck(app: AppHandle) -> AppResult<()> {
    window::hide(&app)
}

#[tauri::command]
pub fn toggle_deck(app: AppHandle) -> AppResult<()> {
    window::toggle(&app)
}

#[tauri::command]
pub fn apply_hotkey(app: AppHandle, enabled: bool, accelerator: String) -> AppResult<()> {
    hotkey::apply(&app, enabled, &accelerator)
}

#[tauri::command]
pub fn apply_window_prefs(app: AppHandle, prefs: WindowPrefs) -> AppResult<()> {
    window::apply_prefs(&app, prefs)
}

/// 진단: 커서·모니터·창 좌표 (물리 px)
#[tauri::command]
pub fn deck_placement_info(app: AppHandle) -> AppResult<PlacementInfo> {
    window::placement_info(&app)
}
