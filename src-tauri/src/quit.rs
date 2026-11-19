//! 정상 종료(트레이 "종료", closeToTray 가 꺼진 X 버튼) 전에 저장되지 않은 변경을 지킨다.
//!
//! 1. Rust 가 `qd://quit-requested` 를 보낸다
//! 2. 프론트가 `quit_ack` 로 받았다고 알리고, 남은 변경을 즉시 한 번 저장한다
//!    - 성공(또는 남은 변경 없음) → `quit_now`
//!    - 실패 → 저장하지 못했다고 알리고 사용자가 고른다: [그래도 종료] → `quit_now` / [취소] → `quit_cancel`
//! 3. 프론트가 ACK_TIMEOUT 안에 답하지 않으면(WebView 가 멈춤 등) 그냥 종료한다 — 종료가 막히지 않게
//!
//! Windows 종료·로그오프·강제 종료처럼 앱이 통제할 수 없는 종료는 다루지 않는다.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::window;

pub const QUIT_REQUESTED_EVENT: &str = "qd://quit-requested";
const ACK_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Default)]
pub struct QuitState {
    /// 종료 요청을 처리하는 중 (사용자 확인 대기 포함)
    requested: AtomicBool,
    acked: AtomicBool,
}

pub fn request(app: &AppHandle, source: &str) {
    let state = app.state::<QuitState>();
    if state.requested.swap(true, Ordering::SeqCst) {
        // 이미 확인 창을 띄운 상태에서 다시 종료를 누르면 창만 보여준다
        log::info!("종료 요청 중복({source}) — 확인 창 표시");
        if let Err(e) = window::show(app) {
            log::warn!("종료 확인 창 표시 실패: {e}");
        }
        return;
    }
    state.acked.store(false, Ordering::SeqCst);
    log::info!("종료 요청({source}) — 저장 확인");
    if let Err(e) = app.emit(QUIT_REQUESTED_EVENT, ()) {
        log::warn!("종료 요청 전달 실패, 바로 종료: {e}");
        app.exit(0);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(ACK_TIMEOUT);
        if !app.state::<QuitState>().acked.load(Ordering::SeqCst) {
            log::warn!("프론트 응답 없음 — 종료");
            app.exit(0);
        }
    });
}

pub fn ack(app: &AppHandle) {
    app.state::<QuitState>().acked.store(true, Ordering::SeqCst);
}

pub fn cancel(app: &AppHandle) {
    log::info!("종료 취소");
    app.state::<QuitState>().requested.store(false, Ordering::SeqCst);
}

pub fn now(app: &AppHandle) {
    log::info!("종료");
    app.exit(0);
}
