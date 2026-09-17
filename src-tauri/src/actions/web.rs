//! URL 열기.
//!
//! - 기본 브라우저: `ShellExecuteW("open", url)` — Windows 가 http/https 연결 프로그램을 고른다.
//! - Edge / Chrome: 실행 파일을 레지스트리 App Paths 와 일반 설치 위치에서 찾아
//!   `Command::new(exe).arg(url)` 로 직접 띄운다 (인자는 OS 가 인용 처리 → 조합 문제 없음).

use std::path::PathBuf;
use std::process::Command;

use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
use winreg::RegKey;

use super::shell::shell_execute;
use super::ExecError;
use crate::model::Browser;

pub fn open_url(url: &str, browser: Browser) -> Result<(), ExecError> {
    let url = validate_url(url)?;
    match browser {
        Browser::Default => shell_execute(url, None, None).map_err(|code| ExecError::Shell {
            target: url.to_owned(),
            code,
        }),
        Browser::Edge => launch_with(find_browser(EDGE).ok_or(ExecError::BrowserNotFound(EDGE.label))?, EDGE.label, url),
        Browser::Chrome => launch_with(find_browser(CHROME).ok_or(ExecError::BrowserNotFound(CHROME.label))?, CHROME.label, url),
    }
}

/// http/https 만 허용하고, 제어 문자·공백이 섞인 값은 거절한다.
/// 한글 등 비 ASCII 문자는 브라우저가 알아서 처리하므로 그대로 둔다.
fn validate_url(url: &str) -> Result<&str, ExecError> {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    let ok_scheme = lower.starts_with("http://") || lower.starts_with("https://");
    let clean = !trimmed.chars().any(|c| c.is_control() || c.is_whitespace());
    if ok_scheme && clean && trimmed.len() > 8 {
        Ok(trimmed)
    } else {
        Err(ExecError::InvalidUrl(url.to_owned()))
    }
}

fn launch_with(exe: PathBuf, label: &str, url: &str) -> Result<(), ExecError> {
    Command::new(&exe)
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|source| ExecError::Launch {
            what: label.to_owned(),
            source,
        })
}

struct BrowserSpec {
    label: &'static str,
    exe: &'static str,
    /// 환경 변수 기준 상대 경로 후보: (환경변수, 하위 경로)
    candidates: &'static [(&'static str, &'static str)],
}

const EDGE: BrowserSpec = BrowserSpec {
    label: "Microsoft Edge",
    exe: "msedge.exe",
    candidates: &[
        ("ProgramFiles(x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
        ("ProgramFiles", "Microsoft\\Edge\\Application\\msedge.exe"),
        ("LocalAppData", "Microsoft\\Edge\\Application\\msedge.exe"),
    ],
};

const CHROME: BrowserSpec = BrowserSpec {
    label: "Google Chrome",
    exe: "chrome.exe",
    candidates: &[
        ("ProgramFiles", "Google\\Chrome\\Application\\chrome.exe"),
        ("ProgramFiles(x86)", "Google\\Chrome\\Application\\chrome.exe"),
        ("LocalAppData", "Google\\Chrome\\Application\\chrome.exe"),
    ],
};

/// 1) 레지스트리 App Paths (HKCU → HKLM → HKLM 32bit) 2) 일반 설치 위치 순으로 찾는다.
fn find_browser(spec: BrowserSpec) -> Option<PathBuf> {
    app_paths_lookup(spec.exe)
        .into_iter()
        .chain(spec.candidates.iter().filter_map(|(var, rel)| {
            std::env::var_os(var).map(|base| PathBuf::from(base).join(rel))
        }))
        .find(|p| p.is_file())
}

fn app_paths_lookup(exe: &str) -> Vec<PathBuf> {
    const SUBKEY: &str = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\";
    const SUBKEY_32: &str = "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\";
    let roots = [
        (HKEY_CURRENT_USER, SUBKEY),
        (HKEY_LOCAL_MACHINE, SUBKEY),
        (HKEY_LOCAL_MACHINE, SUBKEY_32),
    ];
    roots
        .iter()
        .filter_map(|(hive, sub)| {
            RegKey::predef(*hive)
                .open_subkey(format!("{sub}{exe}"))
                .ok()
                .and_then(|k| k.get_value::<String, _>("").ok())
        })
        .map(|s| PathBuf::from(s.trim_matches('"')))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_url_scheme_and_shape() {
        assert!(validate_url("https://www.google.com/search?q=한글 검색".replace(' ', "%20").as_str()).is_ok());
        assert!(validate_url("http://localhost:1430/").is_ok());
        assert!(validate_url("HTTPS://Example.com").is_ok());
        assert!(matches!(validate_url("ftp://x.y"), Err(ExecError::InvalidUrl(_))));
        assert!(matches!(validate_url("file:///C:/x"), Err(ExecError::InvalidUrl(_))));
        assert!(matches!(validate_url("https://a b.com"), Err(ExecError::InvalidUrl(_))));
        assert!(matches!(validate_url("https://"), Err(ExecError::InvalidUrl(_))));
        assert!(matches!(validate_url(""), Err(ExecError::InvalidUrl(_))));
    }

    #[test]
    fn browser_lookup_returns_existing_files_only() {
        for spec in [EDGE, CHROME] {
            let exe = spec.exe;
            if let Some(p) = find_browser(spec) {
                assert!(p.is_file(), "{}", p.display());
                assert!(p.file_name().is_some_and(|n| n.eq_ignore_ascii_case(exe)), "{}", p.display());
                eprintln!("found {exe}: {}", p.display());
            } else {
                eprintln!("{exe} not installed here");
            }
        }
    }
}
