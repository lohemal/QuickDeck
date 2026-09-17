//! 시스템 트레이. 창을 숨겨도 프로세스가 살아 전역 단축키가 계속 동작하게 한다.
//! 메뉴: QuickDeck 열기 / QuickDeck 종료. 아이콘 왼쪽 클릭도 "열기".

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::App;

use crate::window;

pub const TRAY_ID: &str = "quickdeck-tray";
const MENU_OPEN: &str = "open";
const MENU_QUIT: &str = "quit";

pub fn build(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, MENU_OPEN, "QuickDeck 열기", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "QuickDeck 종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("QuickDeck")
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_OPEN => {
                if let Err(e) = window::show(app) {
                    log::warn!("트레이에서 열기 실패: {e}");
                }
            }
            MENU_QUIT => {
                log::info!("트레이에서 종료");
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(e) = window::show(tray.app_handle()) {
                    log::warn!("트레이 클릭 열기 실패: {e}");
                }
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}
