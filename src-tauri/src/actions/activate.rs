//! P11 Activate-or-Launch: 이미 열려 있는 프로그램 / Windows 폴더 / 파일의 기존 창을 찾아 앞으로 가져온다.
//!
//! 원칙: "엉뚱한 창을 활성화하는 것보다 중복 실행이 낫다." 확실히 식별한 창만 활성화하고, 그 외에는 모두
//! `NotFound` 를 돌려주어 호출자(`actions::execute`)가 기존 `ShellExecuteW` 경로로 실행하게 한다.
//!
//! | 대상 | 식별 방법 | 비고 |
//! |---|---|---|
//! | 프로그램 | 보이는 최상위 창의 소유 프로세스 **실행 파일 경로** == 등록 경로 (대소문자 무시, 정규화) | `.lnk` 는 IShellLink 로 대상 exe 를 푼다. 인자가 있는 바로가기는 활성화하지 않는다 |
//! | Windows 폴더 | `ShellWindows`(COM) 가 보고하는 탐색기 창의 **실제 폴더 경로** == 등록 경로 | 창 제목은 보지 않는다 |
//! | 파일 | Running Object Table 에 **정확한 전체 경로**가 등록되어 있고, 연결 프로그램이 Office(Excel/Word/PowerPoint) 이며, 그 프로세스의 창 중 제목이 문서 이름과 맞는 창이 **정확히 하나**일 때 | 같은 이름의 파일이 다른 폴더에서도 열려 있으면 활성화하지 않는다 |
//!
//! 활성화: 최소화면 복원 → `SetForegroundWindow` → 실제 포그라운드가 됐는지 확인 → 안 됐으면 입력 큐를 붙여 한 번 더.
//! QuickDeck 은 사용자가 방금 입력한 프로세스라 보통 허용되지만, Windows 가 거부하더라도 "창을 찾았다" 는 사실은
//! 유지되어(`ActivationRequested`) 같은 프로그램을 하나 더 실행하지 않는다.
//!
//! 탐색은 동작을 실행하는 순간에만 한 번(EnumWindows / ShellWindows / ROT) 한다. 폴링·타이머·백그라운드 스캔은 없다.
//! 권한이 높은 프로세스의 창은 경로를 읽을 수 없으므로 후보에서 빠진다(관리자 권한을 요구하지 않는다).

use std::path::{Path, PathBuf};

use windows::core::{Interface, BOOL, PCWSTR, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND, LPARAM};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CreateBindCtx, GetRunningObjectTable, IDispatch, IPersistFile, CLSCTX_ALL,
    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE, STGM_READ,
};
use windows::Win32::System::Threading::{GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::System::Threading::AttachThreadInput;
use windows::Win32::UI::Shell::{AssocQueryStringW, IShellLinkW, IShellWindows, IWebBrowser2, ShellLink, ShellWindows, ASSOCF_NONE, ASSOCSTR_EXECUTABLE, SLGP_RAWPATH};
use windows::Win32::UI::WindowsAndMessaging::{
    BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GWL_EXSTYLE, GW_OWNER, SW_RESTORE, WS_EX_TOOLWINDOW,
};

/// 기존 창 탐색·활성화 결과. `NotFound` 일 때만 새로 실행한다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// 확실한 기존 창이 없다 → 기존 방식으로 실행
    NotFound,
    /// 기존 창을 찾았고 실제로 포그라운드가 되었다
    Activated,
    /// 기존 창을 찾아 복원·포그라운드를 요청했지만 Windows 가 포그라운드 전환을 확인해 주지 않았다 (작업 표시줄 깜빡임 등).
    /// 창은 확실히 있으므로 새로 실행하지 않는다
    ActivationRequested,
}

impl Outcome {
    /// 새로 실행해야 하는가
    pub fn should_launch(self) -> bool {
        matches!(self, Outcome::NotFound)
    }
}

// ── 순수 판단 로직 (단위 검사 대상) ─────────────────────────────────────

/// Windows 경로 비교용 정규화: 소문자, `/` → `\`, `\\?\` 접두어 제거, 끝의 구분자 제거, 연속 구분자 정리.
/// 심볼릭 링크·정션·네트워크 경로의 동일성까지는 다루지 않는다 (일반 로컬 경로가 대상).
pub fn normalize_path(p: &str) -> String {
    let mut s = p.trim().replace('/', "\\");
    if let Some(rest) = s.strip_prefix("\\\\?\\") {
        s = rest.to_owned();
    }
    let is_unc = s.starts_with("\\\\");
    let mut out = String::with_capacity(s.len());
    let mut prev_sep = false;
    for c in s.chars() {
        let sep = c == '\\';
        if sep && prev_sep && !out.is_empty() {
            continue;
        }
        out.push(c);
        prev_sep = sep;
    }
    if is_unc && !out.starts_with("\\\\") {
        out.insert(0, '\\');
    }
    while out.len() > 3 && out.ends_with('\\') {
        out.pop();
    }
    out.to_lowercase()
}

pub fn same_path(a: &str, b: &str) -> bool {
    let (na, nb) = (normalize_path(a), normalize_path(b));
    !na.is_empty() && na == nb
}

/// `file:///C:/Users/a%20b/%ED%95%9C%EA%B8%80` → `C:\Users\a b\한글`. file URL 이 아니면 None.
pub fn file_url_to_path(url: &str) -> Option<String> {
    let rest = url.strip_prefix("file:///").or_else(|| url.strip_prefix("file://"))?;
    let decoded = percent_decode(rest)?;
    let p = decoded.replace('/', "\\");
    // UNC: file://server/share → \\server\share
    if url.starts_with("file://") && !url.starts_with("file:///") {
        return Some(format!("\\\\{p}"));
    }
    Some(p)
}

fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() + 0 && i + 2 <= bytes.len() - 1 + 1 {
            if i + 2 < bytes.len() + 1 && i + 2 <= bytes.len() {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok()?;
                let v = u8::from_str_radix(hex, 16).ok()?;
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(out).ok()
}

/// 사용자가 상호작용하는 "진짜" 최상위 창인가: 보이고, 소유자 없고, 도구창 아니고, DWM 에 가려지지(cloaked) 않은 창.
pub fn is_user_window(visible: bool, has_owner: bool, tool_window: bool, cloaked: bool) -> bool {
    visible && !has_owner && !tool_window && !cloaked
}

/// 등록 exe 와 같은 프로세스의 창들 중 활성화할 대표 창. `windows` 는 Z 순서(맨 앞이 가장 최근)이어야 한다.
/// 제목이 있는 창을 우선하고, 없으면 첫 번째 창. 하나도 없으면 None.
pub fn pick_program_window<'a>(windows: &'a [WindowInfo], target_exe: &str) -> Option<&'a WindowInfo> {
    let target = normalize_path(target_exe);
    let mut first: Option<&WindowInfo> = None;
    for w in windows {
        if normalize_path(&w.exe) != target {
            continue;
        }
        if !w.title.trim().is_empty() {
            return Some(w);
        }
        first.get_or_insert(w);
    }
    first
}

/// Office 문서 창 제목이 이 문서의 것인가: "정산 - Excel", "정산.xlsx - Excel", "정산 [호환 모드] - Excel", "정산 - 읽기 전용 - Word".
/// 파일 이름(확장자 제외)으로 시작하고 " - {앱}" 으로 끝나야 한다. 다른 문서("정산표 - Excel")는 맞지 않는다.
pub fn office_title_matches(title: &str, stem: &str, ext: &str, app: &str) -> bool {
    let t = title.trim();
    let suffix = format!(" - {app}");
    if !t.ends_with(&suffix) || stem.is_empty() {
        return false;
    }
    let head = &t[..t.len() - suffix.len()];
    let head = head.trim_end();
    if head.eq_ignore_ascii_case(stem) || head.eq_ignore_ascii_case(&format!("{stem}.{ext}")) {
        return true;
    }
    // "정산 [호환 모드]" / "정산 - 읽기 전용" 처럼 이름 뒤에 상태가 붙는 경우
    for sep in [" [", " - ", "  -  "] {
        if let Some(rest) = head.strip_prefix(stem).or_else(|| head.strip_prefix(&format!("{stem}.{ext}"))) {
            if rest.starts_with(sep) {
                return true;
            }
        }
    }
    false
}

/// 파일 활성화가 허용되는 연결 프로그램 (실행 파일 이름 → 창 제목의 앱 이름)
pub const OFFICE_APPS: &[(&str, &str)] = &[("excel.exe", "Excel"), ("winword.exe", "Word"), ("powerpnt.exe", "PowerPoint")];

pub fn office_app_for_exe(exe_path: &str) -> Option<&'static str> {
    let name = Path::new(exe_path).file_name()?.to_string_lossy().to_lowercase();
    OFFICE_APPS.iter().find(|(e, _)| *e == name).map(|(_, app)| *app)
}

/// ROT 에 같은 파일 이름이 다른 경로로도 열려 있는가 (그러면 창 제목으로 구분할 수 없으므로 활성화하지 않는다)
pub fn has_same_name_elsewhere(rot_paths: &[String], target: &str) -> bool {
    let t = normalize_path(target);
    let name = Path::new(&t).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    rot_paths.iter().any(|p| {
        let np = normalize_path(p);
        np != t && Path::new(&np).file_name().is_some_and(|n| n.to_string_lossy() == name)
    })
}

/// 바로가기(.lnk) 의 대상이 활성화 탐색에 쓸 수 있는가: 인자 없는 일반 exe 대상만. 아니면 None → 기존 실행
pub fn usable_shortcut_target(target: &str, args: &str) -> Option<String> {
    let t = target.trim();
    if t.is_empty() || !args.trim().is_empty() {
        return None;
    }
    let p = Path::new(t);
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("exe")) || !p.is_absolute() {
        return None;
    }
    Some(t.to_owned())
}

#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub pid: u32,
    pub title: String,
    pub iconic: bool,
    /// 소유 프로세스의 실행 파일 경로 (읽을 수 없으면 빈 문자열 — 권한이 높은 프로세스 등)
    pub exe: String,
}

// ── Windows 호출 ──────────────────────────────────────────────────────

/// 프로그램 (exe 또는 .lnk) 의 기존 창을 활성화한다.
pub fn activate_program(path: &str) -> Outcome {
    let Some(exe) = resolve_program_exe(path) else {
        return Outcome::NotFound;
    };
    let windows = list_user_windows();
    match pick_program_window(&windows, &exe) {
        Some(w) => {
            log::debug!("activate program: {exe} → hwnd {:#x} '{}'", w.hwnd, w.title);
            activate_window(w.hwnd, w.iconic)
        }
        None => Outcome::NotFound,
    }
}

/// 등록된 폴더를 표시 중인 탐색기 창을 활성화한다.
pub fn activate_folder(path: &str) -> Outcome {
    let target = path.to_owned();
    let found = with_com(move || explorer_window_for(&target));
    match found {
        Some(hwnd) => {
            let iconic = unsafe { IsIconic(HWND(hwnd as _)).as_bool() };
            log::debug!("activate folder: {path} → hwnd {hwnd:#x}");
            activate_window(hwnd, iconic)
        }
        None => Outcome::NotFound,
    }
}

/// 정확히 이 파일을 연 Office 창을 활성화한다. 확신할 수 없으면 NotFound.
pub fn activate_file(path: &str) -> Outcome {
    let p = Path::new(path);
    let Some(ext) = p.extension().map(|e| e.to_string_lossy().to_lowercase()) else {
        return Outcome::NotFound;
    };
    let Some(stem) = p.file_stem().map(|s| s.to_string_lossy().to_string()) else {
        return Outcome::NotFound;
    };
    // 1) 연결 프로그램이 Office 인가
    let Some(exe) = associated_executable(&ext) else {
        return Outcome::NotFound;
    };
    let Some(app) = office_app_for_exe(&exe) else {
        return Outcome::NotFound;
    };
    // 2) ROT 에 정확한 경로가 있는가, 같은 이름이 다른 곳에서도 열려 있지 않은가
    let rot = with_com(running_object_paths);
    if !rot.iter().any(|r| same_path(r, path)) || has_same_name_elsewhere(&rot, path) {
        return Outcome::NotFound;
    }
    // 3) 그 앱의 창 중 제목이 맞는 창이 정확히 하나
    let windows = list_user_windows();
    let exe_n = normalize_path(&exe);
    let candidates: Vec<&WindowInfo> = windows
        .iter()
        .filter(|w| normalize_path(&w.exe) == exe_n && office_title_matches(&w.title, &stem, &ext, app))
        .collect();
    if candidates.len() != 1 {
        log::debug!("activate file: {path} → candidates {} (need exactly 1)", candidates.len());
        return Outcome::NotFound;
    }
    let w = candidates[0];
    log::debug!("activate file: {path} → hwnd {:#x} '{}'", w.hwnd, w.title);
    activate_window(w.hwnd, w.iconic)
}

/// exe 는 그대로, .lnk 는 대상 exe (인자 없는 경우만). 없거나 알 수 없으면 None
fn resolve_program_exe(path: &str) -> Option<String> {
    let p = Path::new(path);
    if !p.is_file() {
        return None;
    }
    let ext = p.extension()?.to_string_lossy().to_lowercase();
    match ext.as_str() {
        "exe" => Some(path.to_owned()),
        "lnk" => {
            let lnk = path.to_owned();
            let (target, args) = with_com(move || shortcut_target(&lnk))?;
            usable_shortcut_target(&target, &args).filter(|t| Path::new(t).is_file())
        }
        _ => None,
    }
}

/// 보이는 최상위 사용자 창을 Z 순서대로 (앞이 먼저)
pub fn list_user_windows() -> Vec<WindowInfo> {
    let mut out: Vec<WindowInfo> = Vec::new();
    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        // SAFETY: lparam 은 EnumWindows 호출 동안 살아 있는 Vec 포인터
        let out = unsafe { &mut *(lparam.0 as *mut Vec<WindowInfo>) };
        unsafe {
            let visible = IsWindowVisible(hwnd).as_bool();
            let has_owner = GetWindow(hwnd, GW_OWNER).is_ok_and(|o| !o.is_invalid());
            let exstyle = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
            let tool = exstyle & WS_EX_TOOLWINDOW.0 != 0;
            let mut cloaked: u32 = 0;
            let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut _, 4);
            if !is_user_window(visible, has_owner, tool, cloaked != 0) {
                return BOOL(1);
            }
            let mut pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            let len = GetWindowTextLengthW(hwnd);
            let mut buf = vec![0u16; (len.max(0) as usize) + 1];
            let n = GetWindowTextW(hwnd, &mut buf);
            let title = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            out.push(WindowInfo { hwnd: hwnd.0 as isize, pid, title, iconic: IsIconic(hwnd).as_bool(), exe: process_image(pid) });
        }
        BOOL(1)
    }
    unsafe {
        let _ = EnumWindows(Some(cb), LPARAM(&mut out as *mut Vec<WindowInfo> as isize));
    }
    out
}

/// 프로세스 실행 파일 경로. 열 수 없으면(권한 등) 빈 문자열
fn process_image(pid: u32) -> String {
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let r = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len);
        let _ = CloseHandle(h);
        if r.is_ok() {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

/// 최소화 복원 + 포그라운드. QuickDeck 은 사용자가 방금 입력한 프로세스라 대개 허용된다.
fn activate_window(hwnd: isize, iconic: bool) -> Outcome {
    let h = HWND(hwnd as _);
    unsafe {
        if iconic || IsIconic(h).as_bool() {
            let _ = ShowWindow(h, SW_RESTORE);
        }
        let _ = SetForegroundWindow(h);
        if is_foreground(h) {
            return Outcome::Activated;
        }
        // 포그라운드 창의 스레드에 입력 큐를 잠시 붙이면 Windows 가 전환을 허용하는 경우가 있다
        let fg = GetForegroundWindow();
        let fg_thread = GetWindowThreadProcessId(fg, None);
        let me = GetCurrentThreadId();
        let attached = fg_thread != 0 && fg_thread != me && AttachThreadInput(me, fg_thread, true).as_bool();
        let _ = BringWindowToTop(h);
        let _ = SetForegroundWindow(h);
        if attached {
            let _ = AttachThreadInput(me, fg_thread, false);
        }
        if is_foreground(h) {
            Outcome::Activated
        } else {
            log::debug!("activate: foreground not confirmed for hwnd {hwnd:#x} (window exists; not relaunching)");
            Outcome::ActivationRequested
        }
    }
}

fn is_foreground(h: HWND) -> bool {
    unsafe { GetForegroundWindow() == h }
}

/// COM(STA) 이 초기화된 전용 스레드에서 실행한다 (Tauri 명령 스레드는 COM 상태를 보장하지 않는다)
fn with_com<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T
where
    T: Default,
{
    std::thread::spawn(move || unsafe {
        let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
        let r = f();
        if com.is_ok() {
            CoUninitialize();
        }
        r
    })
    .join()
    .unwrap_or_default()
}

/// 탐색기 창 중 이 폴더를 표시하는 창의 HWND (ShellWindows COM). 실패·없음 → None
fn explorer_window_for(target: &str) -> Option<isize> {
    unsafe {
        let shell: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL).ok()?;
        let count = shell.Count().unwrap_or(0);
        for i in 0..count {
            let Ok(disp) = shell.Item(&VARIANT::from(i)) else { continue };
            let disp: IDispatch = disp;
            let Ok(browser) = disp.cast::<IWebBrowser2>() else { continue };
            let Ok(url) = browser.LocationURL() else { continue };
            let Some(path) = file_url_to_path(&url.to_string()) else { continue };
            if !same_path(&path, target) {
                continue;
            }
            let Ok(hwnd) = browser.HWND() else { continue };
            let hwnd = hwnd.0 as isize;
            let h = HWND(hwnd as _);
            // 데스크톱 등 숨은 셸 창은 제외: 보이는 최상위 창이어야 한다
            if !IsWindowVisible(h).as_bool() {
                continue;
            }
            return Some(hwnd);
        }
        None
    }
}

/// Running Object Table 에 등록된 파일 모니커의 표시 이름(전체 경로) 목록
fn running_object_paths() -> Vec<String> {
    let mut out = Vec::new();
    unsafe {
        let Ok(rot) = GetRunningObjectTable(0) else { return out };
        let Ok(en) = rot.EnumRunning() else { return out };
        let Ok(bind) = CreateBindCtx(0) else { return out };
        loop {
            let mut item = [None];
            let mut fetched = 0u32;
            if en.Next(&mut item, Some(&mut fetched)).is_err() || fetched == 0 {
                break;
            }
            let Some(m) = item[0].take() else { break };
            if let Ok(name) = m.GetDisplayName(&bind, None) {
                let s = name.to_string().unwrap_or_default();
                // 파일 경로만 (드라이브 또는 UNC). "!{GUID}" 같은 항목은 제외
                if s.len() > 3 && (s.as_bytes()[1] == b':' || s.starts_with("\\\\")) {
                    out.push(s);
                }
                windows::Win32::System::Com::CoTaskMemFree(Some(name.0 as *const _));
            }
        }
    }
    out
}

/// 확장자의 연결 프로그램 실행 파일 경로 (AssocQueryString). 없으면 None
fn associated_executable(ext: &str) -> Option<String> {
    let assoc: Vec<u16> = format!(".{ext}").encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let mut len: u32 = 0;
        let _ = AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, PCWSTR(assoc.as_ptr()), PCWSTR::null(), None, &mut len);
        if len == 0 {
            return None;
        }
        let mut buf = vec![0u16; len as usize];
        let hr = AssocQueryStringW(ASSOCF_NONE, ASSOCSTR_EXECUTABLE, PCWSTR(assoc.as_ptr()), PCWSTR::null(), Some(PWSTR(buf.as_mut_ptr())), &mut len);
        if hr.is_err() {
            return None;
        }
        let s = String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1)]);
        (!s.is_empty()).then_some(s)
    }
}

/// .lnk 의 (대상 경로, 인자). 읽지 못하면 None
fn shortcut_target(lnk: &str) -> Option<(String, String)> {
    unsafe {
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
        let file: IPersistFile = link.cast().ok()?;
        let w: Vec<u16> = lnk.encode_utf16().chain(std::iter::once(0)).collect();
        file.Load(PCWSTR(w.as_ptr()), STGM_READ).ok()?;
        let mut path = [0u16; 1024];
        link.GetPath(&mut path, std::ptr::null_mut(), SLGP_RAWPATH.0 as u32).ok()?;
        let mut args = [0u16; 1024];
        let _ = link.GetArguments(&mut args);
        let cut = |b: &[u16]| String::from_utf16_lossy(&b[..b.iter().position(|&c| c == 0).unwrap_or(b.len())]);
        let target = cut(&path);
        // 환경 변수(%ProgramFiles% 등)가 들어 있으면 풀어 준다
        let target = expand_env(&target);
        Some((target, cut(&args)))
    }
}

fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find('%') {
        out.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(end) = after.find('%') {
            let name = &after[..end];
            match std::env::var(name) {
                Ok(v) => out.push_str(&v),
                Err(_) => {
                    out.push('%');
                    out.push_str(name);
                    out.push('%');
                }
            }
            rest = &after[end + 1..];
        } else {
            out.push('%');
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

#[allow(dead_code)]
fn _unused(_: PathBuf, _: HANDLE) {}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(hwnd: isize, title: &str, exe: &str) -> WindowInfo {
        WindowInfo { hwnd, pid: 1, title: title.into(), iconic: false, exe: exe.into() }
    }

    #[test]
    fn normalizes_windows_paths() {
        assert_eq!(normalize_path("C:\\Users\\A\\Docs\\"), "c:\\users\\a\\docs");
        assert_eq!(normalize_path("c:/users/a/docs"), "c:\\users\\a\\docs");
        assert_eq!(normalize_path("\\\\?\\C:\\X\\\\Y\\"), "c:\\x\\y");
        assert_eq!(normalize_path("C:\\"), "c:\\");
        assert_eq!(normalize_path("\\\\server\\share\\f\\"), "\\\\server\\share\\f");
        assert!(same_path("C:\\업무\\정산", "c:/업무/정산/"));
        assert!(!same_path("C:\\업무\\정산", "C:\\업무\\정산표"));
        assert!(!same_path("", ""));
    }

    #[test]
    fn converts_explorer_location_urls() {
        assert_eq!(file_url_to_path("file:///C:/Users/TestUser/Documents").as_deref(), Some("C:\\Users\\TestUser\\Documents"));
        assert_eq!(file_url_to_path("file:///C:/a%20b/%ED%95%9C%EA%B8%80").as_deref(), Some("C:\\a b\\한글"));
        assert_eq!(file_url_to_path("file://server/share/x").as_deref(), Some("\\\\server\\share\\x"));
        assert_eq!(file_url_to_path("https://example.com/"), None);
        assert_eq!(file_url_to_path("::{20D04FE0-3AEA-1069-A2D8-08002B30309D}"), None);
    }

    #[test]
    fn filters_user_windows() {
        assert!(is_user_window(true, false, false, false));
        assert!(!is_user_window(false, false, false, false), "숨은 창");
        assert!(!is_user_window(true, true, false, false), "소유자 있는 창(대화상자 등)");
        assert!(!is_user_window(true, false, true, false), "도구창");
        assert!(!is_user_window(true, false, false, true), "cloaked(UWP 숨김)");
    }

    #[test]
    fn picks_program_window_by_exe_path_only() {
        let ws = vec![
            w(1, "ChatGPT", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"),
            w(2, "", "C:\\Apps\\foo.exe"),
            w(3, "Foo - 문서", "c:/apps/FOO.EXE"),
            w(4, "foo.exe 와 이름만 같은 다른 프로그램", "D:\\other\\foo.exe"),
        ];
        assert_eq!(pick_program_window(&ws, "C:\\Apps\\foo.exe").map(|x| x.hwnd), Some(3), "제목 있는 창 우선, 대소문자·슬래시 무시");
        assert!(pick_program_window(&ws, "C:\\Apps\\bar.exe").is_none(), "없는 프로그램");
        assert_eq!(pick_program_window(&ws, "D:\\other\\foo.exe").map(|x| x.hwnd), Some(4), "같은 이름 다른 경로는 구분");
        let only_untitled = vec![w(9, "", "C:\\Apps\\foo.exe")];
        assert_eq!(pick_program_window(&only_untitled, "C:\\Apps\\foo.exe").map(|x| x.hwnd), Some(9));
        assert!(pick_program_window(&ws, "C:\\Apps\\notepad.exe").is_none(), "관련 없는 프로세스 거부");
    }

    #[test]
    fn office_titles_must_match_exact_document_name() {
        assert!(office_title_matches("정산 - Excel", "정산", "xlsx", "Excel"));
        assert!(office_title_matches("정산.xlsx - Excel", "정산", "xlsx", "Excel"));
        assert!(office_title_matches("정산 [호환 모드] - Excel", "정산", "xlsx", "Excel"));
        assert!(office_title_matches("계획 - 읽기 전용 - Word", "계획", "docx", "Word"));
        assert!(!office_title_matches("정산표 - Excel", "정산", "xlsx", "Excel"), "앞부분만 같은 다른 문서");
        assert!(!office_title_matches("정산 - Word", "정산", "xlsx", "Excel"), "다른 앱");
        assert!(!office_title_matches("Excel", "정산", "xlsx", "Excel"));
        assert!(!office_title_matches("정산 - Excel", "", "xlsx", "Excel"));
    }

    #[test]
    fn rejects_same_name_in_other_folder() {
        let rot = vec!["C:\\업무\\정산.xlsx".to_string(), "C:\\다른폴더\\정산.xlsx".to_string()];
        assert!(has_same_name_elsewhere(&rot, "C:\\업무\\정산.xlsx"), "같은 이름이 다른 폴더에도 열려 있으면 활성화 금지");
        let single = vec!["C:\\업무\\정산.xlsx".to_string(), "C:\\업무\\계획.docx".to_string()];
        assert!(!has_same_name_elsewhere(&single, "C:\\업무\\정산.xlsx"));
        assert!(!has_same_name_elsewhere(&single, "c:/업무/정산.xlsx"));
    }

    #[test]
    fn office_app_detection() {
        assert_eq!(office_app_for_exe("C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE"), Some("Excel"));
        assert_eq!(office_app_for_exe("C:\\x\\WINWORD.EXE"), Some("Word"));
        assert_eq!(office_app_for_exe("C:\\Program Files (x86)\\Hnc\\Hwp.exe"), None, "검증되지 않은 앱은 미지원");
        assert_eq!(office_app_for_exe("C:\\Windows\\System32\\notepad.exe"), None);
    }

    #[test]
    fn shortcut_targets_with_arguments_fall_back() {
        assert_eq!(usable_shortcut_target("C:\\Apps\\foo.exe", "").as_deref(), Some("C:\\Apps\\foo.exe"));
        assert_eq!(usable_shortcut_target("C:\\Apps\\foo.exe", "--profile x"), None, "인자가 있으면 기존 실행");
        assert_eq!(usable_shortcut_target("", ""), None);
        assert_eq!(usable_shortcut_target("C:\\Apps\\doc.docx", ""), None, "exe 가 아닌 대상");
        assert_eq!(usable_shortcut_target("foo.exe", ""), None, "절대 경로가 아님");
    }

    #[test]
    fn outcome_launch_decision() {
        assert!(Outcome::NotFound.should_launch());
        assert!(!Outcome::Activated.should_launch());
        assert!(!Outcome::ActivationRequested.should_launch(), "창을 찾았으면 포그라운드 확인이 안 돼도 새로 실행하지 않는다");
    }

    #[test]
    fn expands_environment_variables() {
        std::env::set_var("QD_TEST_DIR", "C:\\Apps");
        assert_eq!(expand_env("%QD_TEST_DIR%\\foo.exe"), "C:\\Apps\\foo.exe");
        assert_eq!(expand_env("%QD_NOPE%\\x"), "%QD_NOPE%\\x");
        assert_eq!(expand_env("plain"), "plain");
    }
}
