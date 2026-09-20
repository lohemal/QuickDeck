//! QuickDeck 백엔드.
//!
//! 모듈 구성
//! - `model`    : 프론트엔드와 주고받는 실행 가능한 동작(Action) 타입
//! - `actions`  : 동작 실행기 (웹·프로그램·파일·폴더·시스템)
//! - `window`   : 메인 창 표시/숨김/배치(커서 모니터 중앙 또는 마지막 위치), 크기·위치 기억, X 버튼 정책
//! - `hotkey`   : 전역 호출 단축키 등록 (값은 프론트 Settings 에서 옴, 실패 시 이전 단축키 복구)
//! - `tray`     : 시스템 트레이 (열기/종료)
//! - `icons`    : 관리 아이콘 폴더(추출 캐시·사용자 이미지), `qdicon://` 프로토콜, 정리
//! - `store`    : 로컬 데이터 파일(quickdeck.json) 읽기/쓰기. 구조는 프론트엔드가 소유한다
//! - `commands` : Tauri 명령(IPC) 진입점. 얇게 유지하고 로직은 위 모듈에 둔다
//! - `error`    : 프론트엔드로 직렬화되는 오류 타입
//!
//! 창은 숨김 상태로 시작한다(tauri.conf.json `visible: false`). 프론트가 설정을 읽어 창 크기·위치를 넘긴 뒤
//! `launch_info` 로 자동 시작 여부를 확인하고, 자동 시작이 아니면 `show_deck` 으로 보여준다.
//! 자동 시작(`--autostart` 인자)이면 트레이에서 대기하다가 전역 단축키로 부를 때 나타난다.
//!
//! 이후 단계에서 추가될 모듈: `icons`(아이콘 추출·이미지 처리)

pub mod actions;
mod commands;
pub mod error;
mod hotkey;
pub mod icons;
mod model;
mod store;
mod tray;
pub mod window;

use tauri::{Manager, WindowEvent};

/// 자동 시작 등록 시 붙는 인자. 이 인자로 시작되면 창을 띄우지 않는다.
pub const AUTOSTART_ARG: &str = "--autostart";

pub fn launched_by_autostart() -> bool {
    std::env::args().any(|a| a == AUTOSTART_ARG)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .manage(window::WindowState::default())
        .manage(hotkey::HotkeyState::default())
        // 관리 아이콘 서빙: qdicon://localhost/<extracted|custom>/<name>.png (Windows: http://qdicon.localhost/…)
        // 폴더 안의 검증된 파일명만 읽고, 없으면 404 → 프론트가 내장 아이콘으로 폴백한다
        .register_uri_scheme_protocol("qdicon", |ctx, request| {
            let id = request.uri().path().trim_start_matches('/').to_owned();
            match icons::read_managed(ctx.app_handle(), &id) {
                Ok(bytes) => tauri::http::Response::builder()
                    .status(200)
                    .header("Content-Type", "image/png")
                    .header("Cache-Control", "no-cache")
                    .body(bytes)
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .body(Vec::new())
                    .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
            }
        })
        .setup(|app| {
            let path = store::data_file(app.handle())?;
            log::info!("데이터 파일: {}", path.display());
            if launched_by_autostart() {
                log::info!("자동 시작으로 실행됨 — 창을 띄우지 않고 트레이에서 대기");
            }
            tray::build(app)?;
            Ok(())
        })
        .on_window_event(|win, event| {
            if win.label() != window::MAIN_WINDOW {
                return;
            }
            match event {
                // X 버튼: 설정(closeToTray)에 따라 트레이로 숨기거나 그대로 종료
                WindowEvent::CloseRequested { api, .. } => {
                    if window::prefs(win.app_handle()).close_to_tray {
                        api.prevent_close();
                        if let Err(e) = window::hide(win.app_handle()) {
                            log::warn!("트레이로 숨기기 실패: {e}");
                        }
                    } else {
                        log::info!("X 버튼으로 종료");
                    }
                }
                // 사용자가 창을 옮기거나 크기를 바꾸면 기억한다
                WindowEvent::Moved(_) | WindowEvent::Resized(_) => window::on_bounds_changed(win.app_handle()),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::load_app_data,
            commands::save_app_data,
            commands::execute_action,
            commands::show_deck,
            commands::hide_deck,
            commands::toggle_deck,
            commands::apply_hotkey,
            commands::apply_window_prefs,
            commands::deck_placement_info,
            commands::launch_info,
            commands::icon_extract,
            commands::icon_import_image,
            commands::icon_cleanup,
        ])
        .run(tauri::generate_context!())
        .expect("QuickDeck 실행 실패");
}
