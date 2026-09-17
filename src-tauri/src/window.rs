//! 메인 창 표시/숨김/배치와 창 상태 기억.
//!
//! - 표시 위치는 설정(`show_at`)에 따라 (a) 마우스 커서가 있는 모니터의 **작업 영역** 중앙,
//!   (b) 마지막 사용 위치(그 자리가 현재 어느 모니터 작업 영역에도 없으면 (a) 로 폴백) 중 하나
//! - 창 크기는 항상 마지막 크기를 복원한다. 크기는 **논리 px** 로 기억해 DPI 가 다른 모니터에서도 체감 크기가 같다
//! - 위치·모니터 계산은 **물리 px** 만 쓴다 (`cursor_position`·`monitor_from_point`·`work_area`·`outer_size`)
//! - DPI 가 다른 모니터로 옮기면 Windows 가 창 크기를 다시 재므로 배치 → 표시 → 크기·배치 재적용 순으로 한다
//! - 사용자가 창을 움직이거나 크기를 바꾸면 디바운스 후 `deck-bounds` 이벤트로 프론트에 알려 저장하게 한다
//! - 표시/숨김은 `deck-visibility` 이벤트로 알린다 (팝오버 정리·포커스 처리·향후 애니메이션 레이어용)

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewWindow};

use crate::error::{AppError, AppResult};

pub const MAIN_WINDOW: &str = "main";
pub const VISIBILITY_EVENT: &str = "deck-visibility";
pub const BOUNDS_EVENT: &str = "deck-bounds";
const BOUNDS_DEBOUNCE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ShowAt {
    #[default]
    CursorMonitor,
    LastPosition,
}

/// 프론트 Settings.window.lastBounds 와 같은 모양. x/y 물리 px, width/height 논리 px.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: f64,
    pub height: f64,
}

/// 프론트엔드 Settings.window 중 Rust 가 알아야 하는 부분. 프론트가 로드·변경 시 `apply_window_prefs` 로 넘긴다.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowPrefs {
    pub always_on_top: bool,
    /// X 버튼: true 면 트레이로 숨김, false 면 종료
    pub close_to_tray: bool,
    #[serde(default)]
    pub show_at: ShowAt,
    #[serde(default)]
    pub last_bounds: Option<Bounds>,
}

impl Default for WindowPrefs {
    fn default() -> Self {
        // src/model/settings.ts 의 기본값과 같아야 한다
        Self {
            always_on_top: false,
            close_to_tray: true,
            show_at: ShowAt::CursorMonitor,
            last_bounds: None,
        }
    }
}

#[derive(Default)]
pub struct WindowState {
    pub prefs: Mutex<WindowPrefs>,
    /// 프로그램이 창을 옮기는 동안(show 중)에는 bounds 이벤트를 기록하지 않는다
    placing: AtomicBool,
    bounds_generation: AtomicU64,
}

pub fn main_window(app: &AppHandle) -> AppResult<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| AppError::Other("메인 창을 찾을 수 없습니다.".into()))
}

pub fn prefs(app: &AppHandle) -> WindowPrefs {
    app.state::<WindowState>().prefs.lock().map(|p| *p).unwrap_or_default()
}

pub fn apply_prefs(app: &AppHandle, prefs: WindowPrefs) -> AppResult<()> {
    let state = app.state::<WindowState>();
    *state.prefs.lock().map_err(|_| AppError::Other("창 설정 잠금 실패".into()))? = prefs;
    main_window(app)?.set_always_on_top(prefs.always_on_top)?;
    Ok(())
}

/// 설정에 따라 창을 두고, 보이게 하고, 활성화한다.
pub fn show(app: &AppHandle) -> AppResult<()> {
    let win = main_window(app)?;
    let p = prefs(app);
    let state = app.state::<WindowState>();
    state.placing.store(true, Ordering::SeqCst);

    let result = (|| -> AppResult<()> {
        let restored = match (p.show_at, p.last_bounds) {
            (ShowAt::LastPosition, Some(b)) => restore_last_position(app, &win, b)?,
            _ => false,
        };
        if !restored {
            let monitor = target_monitor(app, &win)?;
            if let Some(m) = &monitor {
                place_center(&win, m, p.last_bounds)?;
            }
            win.show()?;
            if win.is_minimized()? {
                win.unminimize()?;
            }
            // 다른 DPI 의 모니터로 옮겨졌다면 창 크기가 다시 재졌으므로 새 크기로 다시 중앙에
            if let Some(m) = &monitor {
                place_center(&win, m, p.last_bounds)?;
            }
        } else {
            win.show()?;
            if win.is_minimized()? {
                win.unminimize()?;
            }
        }
        win.set_focus()?;
        Ok(())
    })();

    // 배치 중 발생한 Moved/Resized 는 사용자가 한 것이 아니므로 무시하고, 다음 이벤트부터 기록한다
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(200));
        handle.state::<WindowState>().placing.store(false, Ordering::SeqCst);
    });

    result?;
    app.emit(VISIBILITY_EVENT, true)?;
    Ok(())
}

pub fn hide(app: &AppHandle) -> AppResult<()> {
    let win = main_window(app)?;
    win.hide()?;
    app.emit(VISIBILITY_EVENT, false)?;
    Ok(())
}

/// 보이고 활성화된 상태면 숨기고, 그 외(숨김·최소화·뒤에 있음)에는 설정 위치에 표시한다.
pub fn toggle(app: &AppHandle) -> AppResult<()> {
    let win = main_window(app)?;
    let visible = win.is_visible()? && !win.is_minimized()?;
    if visible && win.is_focused()? {
        hide(app)
    } else {
        show(app)
    }
}

/// 사용자가 창을 옮기거나 크기를 바꿨을 때(Moved/Resized). 잠시 뒤 한 번만 `deck-bounds` 를 보낸다.
pub fn on_bounds_changed(app: &AppHandle) {
    let state = app.state::<WindowState>();
    if state.placing.load(Ordering::SeqCst) {
        return;
    }
    let Ok(win) = main_window(app) else { return };
    if !win.is_visible().unwrap_or(false) || win.is_minimized().unwrap_or(false) {
        return;
    }
    let gen = state.bounds_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(BOUNDS_DEBOUNCE);
        let state = handle.state::<WindowState>();
        if state.bounds_generation.load(Ordering::SeqCst) != gen {
            return; // 그 사이 또 움직였다
        }
        if let Ok(Some(b)) = current_bounds(&handle) {
            let _ = handle.emit(BOUNDS_EVENT, b);
        }
    });
}

fn current_bounds(app: &AppHandle) -> AppResult<Option<Bounds>> {
    let win = main_window(app)?;
    if !win.is_visible()? || win.is_minimized()? {
        return Ok(None);
    }
    let pos = win.outer_position()?;
    let size = win.inner_size()?;
    let scale = win.scale_factor()?;
    Ok(Some(Bounds {
        x: pos.x,
        y: pos.y,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    }))
}

/// 1) 커서가 있는 모니터 → 2) 창이 현재 있는 모니터 → 3) 주 모니터
fn target_monitor(app: &AppHandle, win: &WebviewWindow) -> AppResult<Option<Monitor>> {
    if let Ok(cursor) = app.cursor_position() {
        if let Some(m) = app.monitor_from_point(cursor.x, cursor.y)? {
            return Ok(Some(m));
        }
    }
    if let Some(m) = win.current_monitor()? {
        return Ok(Some(m));
    }
    Ok(app.primary_monitor()?)
}

/// 모니터 작업 영역 중앙에 둔다. 기억된 크기가 있으면 먼저 적용한다(작업 영역보다 크면 줄인다).
fn place_center(win: &WebviewWindow, monitor: &Monitor, last: Option<Bounds>) -> AppResult<()> {
    let wa = monitor.work_area();
    if let Some(b) = last {
        let scale = monitor.scale_factor();
        let (w, h) = fit_logical_size((b.width, b.height), (wa.size.width, wa.size.height), scale);
        win.set_size(LogicalSize::new(w, h))?;
    }
    let size = win.outer_size()?;
    let (x, y) = center_in(
        (wa.position.x, wa.position.y, wa.size.width, wa.size.height),
        (size.width, size.height),
    );
    win.set_position(PhysicalPosition::new(x, y))?;
    Ok(())
}

/// 마지막 위치가 현재 모니터 중 하나의 작업 영역 안이면 그 자리(필요하면 안으로 밀어서)에 둔다. 아니면 false.
fn restore_last_position(app: &AppHandle, win: &WebviewWindow, b: Bounds) -> AppResult<bool> {
    // 창 좌상단 근처 점이 속한 모니터를 찾는다 (제거된 모니터의 좌표면 None)
    let probe_x = b.x as f64 + 40.0;
    let probe_y = b.y as f64 + 20.0;
    let Some(monitor) = app.monitor_from_point(probe_x, probe_y)? else {
        log::info!("마지막 위치 ({}, {}) 가 현재 모니터에 없어 중앙으로 폴백", b.x, b.y);
        return Ok(false);
    };
    let wa = monitor.work_area();
    let area = (wa.position.x, wa.position.y, wa.size.width, wa.size.height);

    // 1) 먼저 그 모니터로 옮겨 DPI 를 맞춘 뒤 2) 크기를 논리 단위로 적용하고 3) 작업 영역 안으로 보정
    win.set_position(PhysicalPosition::new(b.x, b.y))?;
    let scale = monitor.scale_factor();
    let (w, h) = fit_logical_size((b.width, b.height), (wa.size.width, wa.size.height), scale);
    win.set_size(LogicalSize::new(w, h))?;
    let size = win.outer_size()?;
    let (x, y) = clamp_into(area, (b.x, b.y), (size.width, size.height));
    win.set_position(PhysicalPosition::new(x, y))?;
    Ok(true)
}

/// 영역 `(x, y, w, h)` 안에 크기 `(w, h)` 의 창을 중앙 배치할 좌상단 좌표. 모두 물리 px.
/// 창이 영역보다 크면 좌상단을 영역 시작점에 맞춘다(음수 오프셋으로 밀려나지 않게).
pub fn center_in(area: (i32, i32, u32, u32), size: (u32, u32)) -> (i32, i32) {
    let (ax, ay, aw, ah) = area;
    let (w, h) = size;
    let x = ax + (aw as i64 - w as i64).max(0) as i32 / 2;
    let y = ay + (ah as i64 - h as i64).max(0) as i32 / 2;
    (x, y)
}

/// 창이 영역 밖으로 나가지 않도록 좌상단을 밀어 넣는다. 창이 영역보다 크면 영역 시작점에 맞춘다.
pub fn clamp_into(area: (i32, i32, u32, u32), pos: (i32, i32), size: (u32, u32)) -> (i32, i32) {
    let (ax, ay, aw, ah) = area;
    let max_x = ax + (aw as i64 - size.0 as i64).max(0) as i32;
    let max_y = ay + (ah as i64 - size.1 as i64).max(0) as i32;
    (pos.0.clamp(ax, max_x), pos.1.clamp(ay, max_y))
}

/// 기억된 논리 크기를 작업 영역(물리) 안에 들어가게 줄인다. 너무 작은 값은 최소 크기로 올린다.
pub fn fit_logical_size(logical: (f64, f64), area_physical: (u32, u32), scale: f64) -> (f64, f64) {
    const MIN_W: f64 = 200.0;
    const MIN_H: f64 = 160.0;
    let max_w = (area_physical.0 as f64 / scale).floor();
    let max_h = (area_physical.1 as f64 / scale).floor();
    let w = logical.0.min(max_w).max(MIN_W.min(max_w));
    let h = logical.1.min(max_h).max(MIN_H.min(max_h));
    (w, h)
}

// ── 진단용: 커서·모니터·창 상태 ─────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    name: Option<String>,
    position: (i32, i32),
    size: (u32, u32),
    work_area: (i32, i32, u32, u32),
    scale_factor: f64,
    contains_cursor: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementInfo {
    cursor: Option<(f64, f64)>,
    monitors: Vec<MonitorInfo>,
    window_position: (i32, i32),
    window_size: (u32, u32),
    window_inner_logical: (f64, f64),
    window_scale_factor: f64,
    visible: bool,
    focused: bool,
    always_on_top: bool,
    show_at: ShowAt,
    last_bounds: Option<Bounds>,
}

pub fn placement_info(app: &AppHandle) -> AppResult<PlacementInfo> {
    let win = main_window(app)?;
    let p = prefs(app);
    let cursor = app.cursor_position().ok();
    let cursor_monitor = cursor.and_then(|c| app.monitor_from_point(c.x, c.y).ok().flatten());
    let monitors = app
        .available_monitors()?
        .into_iter()
        .map(|m| {
            let wa = m.work_area();
            MonitorInfo {
                name: m.name().cloned(),
                position: (m.position().x, m.position().y),
                size: (m.size().width, m.size().height),
                work_area: (wa.position.x, wa.position.y, wa.size.width, wa.size.height),
                scale_factor: m.scale_factor(),
                contains_cursor: cursor_monitor.as_ref().is_some_and(|c| c.position() == m.position()),
            }
        })
        .collect();
    let pos = win.outer_position()?;
    let size = win.outer_size()?;
    let inner = win.inner_size()?;
    let scale = win.scale_factor()?;
    Ok(PlacementInfo {
        cursor: cursor.map(|c| (c.x, c.y)),
        monitors,
        window_position: (pos.x, pos.y),
        window_size: (size.width, size.height),
        window_inner_logical: (inner.width as f64 / scale, inner.height as f64 / scale),
        window_scale_factor: scale,
        visible: win.is_visible()?,
        focused: win.is_focused()?,
        always_on_top: p.always_on_top,
        show_at: p.show_at,
        last_bounds: p.last_bounds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centers_inside_work_area() {
        assert_eq!(center_in((0, 0, 1920, 1032), (560, 440)), (680, 296));
        assert_eq!(center_in((-2560, 120, 2560, 1392), (840, 660)), (-2560 + 860, 120 + 366));
        assert_eq!(center_in((100, 50, 300, 200), (800, 600)), (100, 50));
    }

    #[test]
    fn clamps_last_position_into_area() {
        let area = (1920, 0, 1920, 1040);
        // 안에 있으면 그대로
        assert_eq!(clamp_into(area, (2000, 100), (600, 400)), (2000, 100));
        // 오른쪽·아래로 넘치면 밀어 넣는다
        assert_eq!(clamp_into(area, (3700, 900), (600, 400)), (1920 + 1920 - 600, 1040 - 400));
        // 왼쪽·위로 넘치면 시작점으로
        assert_eq!(clamp_into(area, (1500, -50), (600, 400)), (1920, 0));
        // 창이 영역보다 크면 시작점
        assert_eq!(clamp_into(area, (2500, 300), (3000, 2000)), (1920, 0));
    }

    #[test]
    fn fits_logical_size_to_work_area_and_minimum() {
        // 1.25x 모니터 1920x1200 → 논리 1536x960 까지
        assert_eq!(fit_logical_size((560.0, 440.0), (1920, 1200), 1.25), (560.0, 440.0));
        assert_eq!(fit_logical_size((3000.0, 2000.0), (1920, 1200), 1.25), (1536.0, 960.0));
        assert_eq!(fit_logical_size((50.0, 40.0), (1920, 1200), 1.25), (200.0, 160.0));
        // 아주 작은 화면이면 최소값도 화면에 맞춘다
        assert_eq!(fit_logical_size((500.0, 500.0), (150, 100), 1.0), (150.0, 100.0));
    }

    #[test]
    fn show_at_serializes_kebab_case() {
        assert_eq!(serde_json::to_string(&ShowAt::CursorMonitor).unwrap(), "\"cursor-monitor\"");
        let p: WindowPrefs = serde_json::from_str(r#"{"alwaysOnTop":true,"closeToTray":false,"showAt":"last-position","lastBounds":{"x":10,"y":20,"width":560.5,"height":440}}"#).unwrap();
        assert_eq!(p.show_at, ShowAt::LastPosition);
        assert_eq!(p.last_bounds.unwrap().width, 560.5);
        // 옛 프론트가 showAt/lastBounds 없이 보내도 기본값으로 읽힌다
        let p: WindowPrefs = serde_json::from_str(r#"{"alwaysOnTop":false,"closeToTray":true}"#).unwrap();
        assert_eq!(p.show_at, ShowAt::CursorMonitor);
        assert!(p.last_bounds.is_none());
    }
}
