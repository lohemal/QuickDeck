//! 아이콘 관리 폴더.
//!
//! 위치: `%APPDATA%\kr.lohemal.quickdeck\icons\`
//! ```text
//! icons/
//!   extracted/  e_<경로 해시 16자리>.png   프로그램·파일에서 추출한 셸 아이콘 (경로마다 한 파일, 캐시)
//!   custom/     c_<uuid>.png              사용자가 고른 이미지를 검증·축소해 PNG 로 정규화한 사본
//! ```
//! - `quickdeck.json` 에는 이 폴더 안의 상대 경로(`extracted/e_….png`, `custom/c_….png`)만 저장한다.
//! - WebView 는 `qdicon://localhost/<상대 경로>` (Windows 에서는 `http://qdicon.localhost/…`) 로 읽는다.
//!   프로토콜 핸들러는 이 폴더 안의 검증된 파일명만 서빙하고, 없으면 404 → 프론트가 내장 아이콘으로 폴백한다.
//! - 추출 캐시는 경로 해시로 이름을 정하므로 같은 프로그램을 쓰는 버튼끼리 파일을 공유한다.
//!   무효화는 하지 않는다(다시 등록하면 덮어쓴다). 정리는 `cleanup` 이 참조되지 않는 파일만 지운다.
//! - 아이콘은 장식 계층이다. 여기서 나는 오류는 실행 계층(actions)과 무관하며 프론트는 폴백으로 처리한다.

mod image_import;
mod shell_icon;

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub use image_import::{import_image, ImportedIcon};

pub const ICONS_DIR: &str = "icons";
pub const EXTRACTED_DIR: &str = "extracted";
pub const CUSTOM_DIR: &str = "custom";
/// 저장·서빙되는 아이콘의 최대 한 변(px)
pub const MAX_ICON_SIZE: u32 = 256;

#[derive(Debug, thiserror::Error)]
pub enum IconError {
    #[error("unsupported image format: {0}")]
    Unsupported(String),
    #[error("image too large: {0} bytes")]
    TooLarge(u64),
    #[error("image decode failed: {0}")]
    Corrupt(String),
    #[error("source not found: {0}")]
    SourceMissing(PathBuf),
    #[error("shell icon extraction failed for {path}: {detail}")]
    Extract { path: PathBuf, detail: String },
    #[error("invalid managed icon id: {0}")]
    InvalidId(String),
    #[error("managed icon not found: {0}")]
    NotFound(String),
}

impl IconError {
    pub fn user_message(&self) -> String {
        match self {
            IconError::Unsupported(_) => "지원하지 않는 이미지 형식입니다. PNG, JPG, WebP, ICO 만 쓸 수 있습니다.".into(),
            IconError::TooLarge(_) => format!("이미지 파일이 너무 큽니다. {}MB 이하만 쓸 수 있습니다.", image_import::MAX_SOURCE_BYTES / 1024 / 1024),
            IconError::Corrupt(_) => "이미지를 읽을 수 없습니다. 손상되었거나 지원하지 않는 내용입니다.".into(),
            IconError::SourceMissing(_) => "선택한 파일을 찾을 수 없습니다.".into(),
            IconError::Extract { .. } => "아이콘을 가져오지 못했습니다. 기본 아이콘을 사용합니다.".into(),
            IconError::InvalidId(_) | IconError::NotFound(_) => "아이콘 파일을 찾을 수 없습니다.".into(),
        }
    }
}

/// 관리 아이콘 파일의 상대 id. 프론트가 저장하는 값과 같은 형식(`extracted/e_….png`, `custom/c_….png`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedIcon {
    pub file: String,
}

pub fn icons_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir()?.join(ICONS_DIR);
    fs::create_dir_all(dir.join(EXTRACTED_DIR))?;
    fs::create_dir_all(dir.join(CUSTOM_DIR))?;
    Ok(dir)
}

/// `extracted/e_0123….png` 같은 상대 id 가 안전한지 (하위 폴더 하나 + 허용 문자 파일명 + .png).
/// 경로 구분자·`..`·절대 경로는 모두 거부한다.
pub fn validate_file_id(id: &str) -> Result<(String, String), IconError> {
    let (dir, name) = id.split_once('/').ok_or_else(|| IconError::InvalidId(id.into()))?;
    let dir_ok = dir == EXTRACTED_DIR || dir == CUSTOM_DIR;
    let name_ok = name.len() > 4
        && name.ends_with(".png")
        && !name.contains("..")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.');
    if dir_ok && name_ok {
        Ok((dir.to_owned(), name.to_owned()))
    } else {
        Err(IconError::InvalidId(id.into()))
    }
}

pub fn managed_path(app: &AppHandle, id: &str) -> AppResult<PathBuf> {
    let (dir, name) = validate_file_id(id)?;
    Ok(icons_dir(app)?.join(dir).join(name))
}

/// 프로토콜 핸들러용: 관리 아이콘 파일 내용. 없거나 id 가 이상하면 오류.
pub fn read_managed(app: &AppHandle, id: &str) -> AppResult<Vec<u8>> {
    let path = managed_path(app, id)?;
    fs::read(&path).map_err(|_| IconError::NotFound(id.into()).into())
}

/// 추출 캐시 파일명. 경로는 대소문자·앞뒤 공백을 무시하고 FNV-1a 64 로 해시한다.
pub fn extracted_id_for(path: &str) -> String {
    let key = path.trim().to_lowercase();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in key.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{EXTRACTED_DIR}/e_{h:016x}.png")
}

/// 프로그램(exe/lnk)·파일·폴더의 셸 아이콘을 추출해 캐시에 두고 id 를 돌려준다. 이미 있으면 추출하지 않는다.
pub fn extract_icon(app: &AppHandle, source: &str) -> AppResult<ManagedIcon> {
    let src = Path::new(source);
    let id = extracted_id_for(source);
    let target = managed_path(app, &id)?;
    if target.is_file() {
        return Ok(ManagedIcon { file: id });
    }
    if !src.exists() {
        return Err(IconError::SourceMissing(src.to_path_buf()).into());
    }
    let img = shell_icon::extract(src, MAX_ICON_SIZE).map_err(|detail| IconError::Extract {
        path: src.to_path_buf(),
        detail,
    })?;
    image_import::save_png_atomic(&img, &target)?;
    log::info!("아이콘 추출: {} → {}", src.display(), id);
    Ok(ManagedIcon { file: id })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupResult {
    pub removed: usize,
    pub kept: usize,
}

/// 참조되지 않는 관리 아이콘 삭제.
/// - `keep_files`: 버튼이 직접 참조하는 id 들 (`custom/…`, `extracted/…`)
/// - `keep_paths`: 자동 아이콘 버튼의 원본 경로들 (→ 캐시 id 로 환산해 보존)
pub fn cleanup(app: &AppHandle, keep_files: &[String], keep_paths: &[String]) -> AppResult<CleanupResult> {
    let mut keep: std::collections::HashSet<String> = keep_files.iter().cloned().collect();
    keep.extend(keep_paths.iter().map(|p| extracted_id_for(p)));
    let root = icons_dir(app)?;
    let mut removed = 0;
    let mut kept = 0;
    for dir in [EXTRACTED_DIR, CUSTOM_DIR] {
        for entry in fs::read_dir(root.join(dir))?.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let id = format!("{dir}/{name}");
            if validate_file_id(&id).is_err() {
                continue; // 우리가 만든 파일이 아니면 건드리지 않는다
            }
            if keep.contains(&id) {
                kept += 1;
            } else if fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    log::info!("아이콘 정리: {removed} 삭제, {kept} 유지");
    Ok(CleanupResult { removed, kept })
}

impl From<IconError> for AppError {
    fn from(e: IconError) -> Self {
        AppError::Icon(e)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_managed_ids() {
        assert!(validate_file_id("extracted/e_0123456789abcdef.png").is_ok());
        assert!(validate_file_id("custom/c_9f1a-2b.png").is_ok());
        assert!(validate_file_id("custom/../quickdeck.json").is_err());
        assert!(validate_file_id("custom/..png").is_err());
        assert!(validate_file_id("other/x.png").is_err());
        assert!(validate_file_id("custom/x.jpg").is_err());
        assert!(validate_file_id("custom/a b.png").is_err());
        assert!(validate_file_id("custom/한글.png").is_err());
        assert!(validate_file_id("C:/custom/x.png").is_err());
        assert!(validate_file_id("custom\\x.png").is_err());
        assert!(validate_file_id("").is_err());
    }

    #[test]
    fn extracted_id_is_stable_and_case_insensitive() {
        let a = extracted_id_for("C:\\Windows\\System32\\notepad.exe");
        let b = extracted_id_for("  c:\\windows\\system32\\NOTEPAD.EXE ");
        assert_eq!(a, b);
        assert!(a.starts_with("extracted/e_") && a.ends_with(".png"));
        assert!(validate_file_id(&a).is_ok());
        assert_ne!(a, extracted_id_for("C:\\Windows\\System32\\calc.exe"));
    }
}
