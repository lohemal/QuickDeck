//! 동작 실행기.
//!
//! - `web.rs`    : 기본 브라우저 / Edge / Chrome 으로 URL 열기
//! - `shell.rs`  : `ShellExecuteW` 래퍼. 프로그램(exe/.lnk) 실행, 파일을 연결 프로그램으로, 폴더를 탐색기로
//! - `system.rs` : 미디어·볼륨 키, 잠금, 절전, 로그아웃/재시작/종료, 시스템 앱
//! - `activate.rs`: (P11) 프로그램·폴더·파일이 이미 열려 있으면 기존 창을 앞으로 (Activate-or-Launch). 확실할 때만
//!
//! 위험한 기능(종료·재시작·로그아웃)의 확인창은 프론트엔드가 이 함수를 부르기 전에 처리한다.
//! 여기서는 받은 동작을 그대로 실행한다.

pub mod activate;
mod shell;
mod system;
mod web;

use std::path::PathBuf;

use crate::model::Action;

pub fn execute(action: &Action) -> Result<(), ExecError> {
    log::debug!("execute: {action:?}");
    match action {
        Action::Website { url, browser } => web::open_url(url, *browser),
        // P11: 이미 열려 있으면 기존 창을 앞으로. 확실한 창이 없을 때(NotFound)만 기존 방식으로 실행한다.
        // 인자가 있는 프로그램은 매번 다른 실행일 수 있으므로 활성화하지 않는다.
        Action::Program { path, args } => {
            if args.is_empty() && !activate::activate_program(path).should_launch() {
                return Ok(());
            }
            shell::run_program(path, args)
        }
        Action::File { path } => {
            if !activate::activate_file(path).should_launch() {
                return Ok(());
            }
            shell::open_file(path)
        }
        Action::Folder { path } => {
            if !activate::activate_folder(path).should_launch() {
                return Ok(());
            }
            shell::open_folder(path)
        }
        Action::System { command } => system::run(*command),
    }
}

/// 실행 실패. `user_message()` 는 사용자용, `detail()` 은 디버깅용.
#[derive(Debug, thiserror::Error)]
pub enum ExecError {
    #[error("invalid url: {0}")]
    InvalidUrl(String),

    #[error("browser not found: {0}")]
    BrowserNotFound(&'static str),

    #[error("file not found: {0}")]
    FileNotFound(PathBuf),

    #[error("folder not found: {0}")]
    FolderNotFound(PathBuf),

    #[error("program not found: {0}")]
    ProgramNotFound(PathBuf),

    #[error("no association for: {0}")]
    NoAssociation(PathBuf),

    #[error("access denied: {0}")]
    AccessDenied(PathBuf),

    /// ShellExecuteW 가 32 이하의 코드를 돌려준 경우
    #[error("ShellExecuteW failed for {target}: code {code}")]
    Shell { target: String, code: isize },

    /// 프로세스 생성 실패 (브라우저·shutdown.exe 등)
    #[error("failed to launch {what}: {source}")]
    Launch {
        what: String,
        #[source]
        source: std::io::Error,
    },

    /// 기타 Win32 API 실패
    #[error("{api} failed: {detail}")]
    Api { api: &'static str, detail: String },
}

impl ExecError {
    pub fn user_message(&self) -> String {
        match self {
            ExecError::InvalidUrl(_) => "올바른 웹사이트 주소가 아닙니다.".into(),
            ExecError::BrowserNotFound(name) => format!("{name}을(를) 찾을 수 없습니다. 설치되어 있는지 확인하세요."),
            ExecError::FileNotFound(_) => "등록된 파일을 찾을 수 없습니다.".into(),
            ExecError::FolderNotFound(_) => "등록된 폴더를 찾을 수 없습니다.".into(),
            ExecError::ProgramNotFound(_) => "등록된 프로그램을 찾을 수 없습니다.".into(),
            ExecError::NoAssociation(_) => "이 파일을 열 수 있는 프로그램이 연결되어 있지 않습니다.".into(),
            ExecError::AccessDenied(_) => "접근이 거부되었습니다. 권한을 확인하세요.".into(),
            ExecError::Shell { .. } => "실행할 수 없습니다.".into(),
            ExecError::Launch { what, .. } => format!("{what}을(를) 실행할 수 없습니다."),
            ExecError::Api { .. } => "Windows 기능을 실행하지 못했습니다.".into(),
        }
    }

    pub fn detail(&self) -> Option<String> {
        Some(self.to_string())
    }
}
