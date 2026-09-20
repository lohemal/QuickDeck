use serde::Serialize;

use crate::actions::ExecError;

/// 프론트엔드로 넘어가는 오류.
///
/// `invoke` 의 reject 값은 `{ message, detail }` 객체가 된다.
/// - `message`: 사용자에게 그대로 보여줄 수 있는 한국어 문장
/// - `detail` : 디버깅용 내부 정보 (경로, Win32 오류 코드 등). UI 는 콘솔에만 남긴다
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Exec(#[from] ExecError),

    #[error("{0}")]
    Icon(crate::icons::IconError),

    #[error("파일 오류: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON 오류: {0}")]
    Json(#[from] serde_json::Error),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn user_message(&self) -> String {
        match self {
            AppError::Exec(e) => e.user_message(),
            AppError::Icon(e) => e.user_message(),
            AppError::Io(_) => "파일을 읽거나 쓸 수 없습니다.".into(),
            AppError::Json(_) => "저장된 데이터 형식이 올바르지 않습니다.".into(),
            AppError::Tauri(_) => "앱 내부 오류가 발생했습니다.".into(),
            AppError::Other(m) => m.clone(),
        }
    }

    pub fn detail(&self) -> Option<String> {
        match self {
            AppError::Exec(e) => e.detail(),
            AppError::Icon(e) => Some(e.to_string()),
            AppError::Other(_) => None,
            other => Some(other.to_string()),
        }
    }
}

#[derive(Serialize)]
struct ErrorPayload {
    message: String,
    detail: Option<String>,
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        ErrorPayload {
            message: self.user_message(),
            detail: self.detail(),
        }
        .serialize(s)
    }
}

pub type AppResult<T> = Result<T, AppError>;
