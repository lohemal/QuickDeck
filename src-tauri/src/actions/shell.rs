//! `ShellExecuteW` 기반 실행.
//!
//! 명령 문자열을 조합하지 않고 파일·인자·작업 폴더를 각각 별도 인자로 넘기므로
//! 한글·공백·괄호가 들어간 경로도 그대로 동작하고 셸 인젝션이 생기지 않는다.
//! `.lnk` 는 Windows Shell 이 스스로 풀어 실행한다.

use std::path::{Path, PathBuf};

use windows::core::PCWSTR;
use windows::Win32::Foundation::{ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::UI::Shell::{ShellExecuteW, SE_ERR_NOASSOC};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use super::ExecError;

/// ShellExecuteW 를 COM 이 초기화된 전용 스레드에서 실행한다.
/// (`.lnk` 풀기 등 셸 기능은 COM 을 요구하고, Tauri 명령은 임의 스레드에서 돈다)
pub fn shell_execute(file: &str, params: Option<&str>, dir: Option<&Path>) -> Result<(), isize> {
    let file = file.to_owned();
    let params = params.map(str::to_owned);
    let dir = dir.map(|d| d.to_path_buf());

    std::thread::spawn(move || {
        // SAFETY: 이 스레드에서만 COM 을 초기화/해제하며, 모든 문자열은 호출이 끝날 때까지 살아 있다.
        unsafe {
            let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
            let file_w = wide(&file);
            let params_w = params.as_deref().map(wide);
            let dir_w = dir.as_deref().map(|d| wide(&d.to_string_lossy()));

            let h = ShellExecuteW(
                None,
                PCWSTR(wide("open").as_ptr()),
                PCWSTR(file_w.as_ptr()),
                params_w.as_ref().map_or(PCWSTR::null(), |p| PCWSTR(p.as_ptr())),
                dir_w.as_ref().map_or(PCWSTR::null(), |d| PCWSTR(d.as_ptr())),
                SW_SHOWNORMAL,
            );
            if com.is_ok() {
                CoUninitialize();
            }
            // 32 이하는 오류 코드다 (ShellExecute 문서)
            let code = h.0 as isize;
            if code > 32 {
                Ok(())
            } else {
                Err(code)
            }
        }
    })
    .join()
    .unwrap_or(Err(-1))
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn map_shell_error(code: isize, target: &Path) -> ExecError {
    match code as u32 {
        c if c == ERROR_FILE_NOT_FOUND.0 => ExecError::FileNotFound(target.to_path_buf()),
        c if c == ERROR_PATH_NOT_FOUND.0 => ExecError::FileNotFound(target.to_path_buf()),
        c if c == ERROR_ACCESS_DENIED.0 => ExecError::AccessDenied(target.to_path_buf()),
        c if c == SE_ERR_NOASSOC => ExecError::NoAssociation(target.to_path_buf()),
        _ => ExecError::Shell {
            target: target.display().to_string(),
            code,
        },
    }
}

/// exe 또는 .lnk 실행. exe 는 자기 폴더를 작업 폴더로 삼고, .lnk 는 바로가기의 "시작 위치"를 셸이 쓴다.
pub fn run_program(path: &str, args: &[String]) -> Result<(), ExecError> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err(ExecError::ProgramNotFound(p));
    }
    let is_lnk = p.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk"));
    let dir = if is_lnk { None } else { p.parent() };
    let params = if args.is_empty() { None } else { Some(join_args(args)) };
    shell_execute(path, params.as_deref(), dir).map_err(|c| match c {
        c if c as u32 == ERROR_FILE_NOT_FOUND.0 || c as u32 == ERROR_PATH_NOT_FOUND.0 => ExecError::ProgramNotFound(p.clone()),
        c => map_shell_error(c, &p),
    })
}

/// 파일을 Windows 기본 연결 프로그램으로 연다.
pub fn open_file(path: &str) -> Result<(), ExecError> {
    let p = PathBuf::from(path);
    if !p.is_file() {
        return Err(ExecError::FileNotFound(p));
    }
    shell_execute(path, None, None).map_err(|c| map_shell_error(c, &p))
}

/// 폴더를 파일 탐색기로 연다.
pub fn open_folder(path: &str) -> Result<(), ExecError> {
    let p = PathBuf::from(path);
    if !p.is_dir() {
        return Err(ExecError::FolderNotFound(p));
    }
    // 폴더를 직접 "open" 하면 탐색기(또는 사용자가 지정한 폴더 핸들러)가 연다
    shell_execute(path, None, None).map_err(|c| match c {
        c if c as u32 == ERROR_FILE_NOT_FOUND.0 || c as u32 == ERROR_PATH_NOT_FOUND.0 => ExecError::FolderNotFound(p.clone()),
        c => map_shell_error(c, &p),
    })
}

/// Windows(CommandLineToArgvW) 규칙으로 인자 목록을 한 문자열로 합친다.
pub fn join_args(args: &[String]) -> String {
    args.iter().map(|a| quote_arg(a)).collect::<Vec<_>>().join(" ")
}

fn quote_arg(arg: &str) -> String {
    if !arg.is_empty() && !arg.chars().any(|c| c == ' ' || c == '\t' || c == '"' || c == '\n') {
        return arg.to_owned();
    }
    let mut out = String::with_capacity(arg.len() + 2);
    out.push('"');
    let mut backslashes = 0;
    for c in arg.chars() {
        match c {
            '\\' => backslashes += 1,
            '"' => {
                out.push_str(&"\\".repeat(backslashes * 2 + 1));
                out.push('"');
                backslashes = 0;
                continue;
            }
            _ => {
                out.push_str(&"\\".repeat(backslashes));
                backslashes = 0;
            }
        }
        if c != '\\' {
            out.push(c);
        }
    }
    out.push_str(&"\\".repeat(backslashes * 2));
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_args_like_windows() {
        let s = |v: &[&str]| join_args(&v.iter().map(|x| x.to_string()).collect::<Vec<_>>());
        assert_eq!(s(&["plain"]), "plain");
        assert_eq!(s(&["C:\\내 문서\\파일 (1).txt"]), "\"C:\\내 문서\\파일 (1).txt\"");
        assert_eq!(s(&["a\"b"]), "\"a\\\"b\"");
        assert_eq!(s(&["trail\\"]), "trail\\");
        assert_eq!(s(&["has space\\"]), "\"has space\\\\\"");
        assert_eq!(s(&[""]), "\"\"");
        assert_eq!(s(&["--flag", "x y"]), "--flag \"x y\"");
    }

    #[test]
    fn missing_targets_are_reported_before_launch() {
        let bogus = "C:\\이런 폴더는 없음 (테스트)\\없는 파일.txt";
        assert!(matches!(open_file(bogus), Err(ExecError::FileNotFound(_))));
        assert!(matches!(open_folder(bogus), Err(ExecError::FolderNotFound(_))));
        assert!(matches!(run_program(bogus), Err(ExecError::ProgramNotFound(_))));
    }

    fn run_program(p: &str) -> Result<(), ExecError> {
        super::run_program(p, &[])
    }
}
