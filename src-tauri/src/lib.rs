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
//! 단일 인스턴스(P12): `tauri-plugin-single-instance` 를 **가장 먼저** 등록한다. 플러그인 초기화는 창·트레이·
//! 단축키보다 앞서 일어나므로, 이미 실행 중이면 두 번째 프로세스는 기존 인스턴스에 신호만 보내고 창을 만들기 전에
//! 종료한다(Windows: 식별자 기반 named mutex + WM_COPYDATA). 기존 인스턴스는 평소의 `window::show` 로 덱을
//! 표시한다 — 전역 단축키·트레이 "열기" 와 같은 동작(위치 정책, 루트 폴더 리셋, 포커스)이며 전용 UX 를 두지 않는다.
//! 두 번째 실행의 인자·cwd 는 기능화하지 않는다(`--autostart` 여부만 보고, 값은 로그에도 남기지 않는다).

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
    args_include_autostart(std::env::args())
}

/// `--autostart` 가 인자 목록에 있는지. 자기 프로세스 인자와 두 번째 인스턴스가 넘겨준 인자 양쪽에 쓴다.
pub fn args_include_autostart<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter().any(|a| a.as_ref() == AUTOSTART_ARG)
}

/// 이미 실행 중인 QuickDeck 에 두 번째 실행이 들어왔을 때(단일 인스턴스 플러그인 콜백, 기존 인스턴스 안에서 실행됨).
/// 두 번째 프로세스는 플러그인이 종료시키므로 여기서는 기존 창을 평소 방식으로 보여주기만 한다.
/// 두 번째 실행이 자동 시작(`--autostart`)이면 사용자가 부른 것이 아니므로 창을 띄우지 않는다
/// (로그인 직후 자동 시작과 수동 실행이 겹칠 때, 수동 실행 쪽이 살아남아도 자동 시작 쪽이 덱을 띄우지 않게).
fn on_second_instance(app: &tauri::AppHandle, args: Vec<String>, _cwd: String) {
    // 인자 값·작업 폴더는 사용자 경로가 들어갈 수 있어 로그에 남기지 않는다(개수만)
    if args_include_autostart(&args) {
        log::info!("이미 실행 중 — 자동 시작으로 들어온 두 번째 실행은 무시");
        return;
    }
    log::info!("이미 실행 중 — 두 번째 실행 감지, 기존 덱을 표시 (인자 {}개)", args.len());
    if let Err(e) = window::show(app) {
        log::warn!("두 번째 실행에서 기존 덱 표시 실패: {e}");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 반드시 첫 번째 플러그인: 다른 플러그인·창·트레이·단축키가 만들어지기 전에 중복 실행을 걸러낸다
        .plugin(tauri_plugin_single_instance::init(on_second_instance))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_autostart_argument_anywhere_in_args() {
        assert!(args_include_autostart(["quickdeck.exe", "--autostart"]));
        assert!(args_include_autostart(vec!["--autostart".to_string()]));
        assert!(!args_include_autostart(["quickdeck.exe"]));
        assert!(!args_include_autostart(Vec::<String>::new()));
        // 비슷하지만 다른 인자는 자동 시작이 아니다
        assert!(!args_include_autostart(["--autostart=1", "-autostart", "autostart"]));
    }
}
