//! 로컬 데이터 파일. 위치: `%APPDATA%\kr.lohemal.quickdeck\quickdeck.json`
//!
//! Rust 는 내용 구조를 해석하지 않는다. 구조(스키마·마이그레이션)의 단일 기준은
//! 프론트엔드 `src/model/appData.ts` 다. 여기서는 올바른 JSON 인지만 확인하고
//! 임시 파일에 쓴 뒤 교체해 저장 도중 꺼져도 기존 파일이 깨지지 않게 한다.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

const FILE_NAME: &str = "quickdeck.json";

pub fn data_file(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(FILE_NAME))
}

/// 파일이 없으면 `None`.
pub fn load(app: &AppHandle) -> AppResult<Option<String>> {
    let path = data_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(path)?))
}

pub fn save(app: &AppHandle, json: &str) -> AppResult<()> {
    // 깨진 JSON 은 받지 않는다
    serde_json::from_str::<serde_json::Value>(json)?;

    let path = data_file(app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// 손상된 데이터 파일을 지우지 않고 같은 폴더의 보존본으로 옮긴다. 보존본 파일 이름을 돌려준다.
/// 프론트는 이것이 성공했을 때만 새 기본값을 저장한다 (실패하면 원본을 그대로 둔다).
pub fn backup_corrupt(app: &AppHandle, stamp: &str) -> AppResult<String> {
    backup_corrupt_at(&data_file(app)?, stamp)
}

fn backup_corrupt_at(path: &Path, stamp: &str) -> AppResult<String> {
    if !is_valid_stamp(stamp) {
        return Err(AppError::Other("보존본 이름이 올바르지 않습니다.".into()));
    }
    if !path.is_file() {
        return Err(AppError::Other("보존할 데이터 파일이 없습니다.".into()));
    }
    let dir = path.parent().ok_or_else(|| AppError::Other("데이터 폴더를 찾을 수 없습니다.".into()))?;
    // 같은 초에 이미 보존본이 있으면 번호를 붙인다. 기존 보존본은 절대 덮어쓰지 않는다
    for n in 0..100u32 {
        let name = if n == 0 { format!("{FILE_NAME}.corrupt-{stamp}") } else { format!("{FILE_NAME}.corrupt-{stamp}-{n}") };
        let target = dir.join(&name);
        if target.exists() {
            continue;
        }
        fs::rename(path, &target)?;
        log::warn!("손상된 데이터 파일을 보존했습니다: {name}");
        return Ok(name);
    }
    Err(AppError::Other("보존본 이름을 정할 수 없습니다.".into()))
}

/// `YYYYMMDD-HHMMSS` (프론트가 로컬 시각으로 만든다). 파일 이름에 그대로 쓰므로 형식을 엄격히 본다
fn is_valid_stamp(stamp: &str) -> bool {
    let b = stamp.as_bytes();
    b.len() == 15 && b[8] == b'-' && b.iter().enumerate().all(|(i, c)| i == 8 || c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("quickdeck-store-test-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn stamp_format() {
        assert!(is_valid_stamp("20261119-235959"));
        assert!(!is_valid_stamp("20261119-23595"));
        assert!(!is_valid_stamp("20261119_235959"));
        assert!(!is_valid_stamp("2026111a-235959"));
        assert!(!is_valid_stamp("../../evil-0000"));
    }

    #[test]
    fn backup_moves_file_and_keeps_bytes() {
        let dir = temp_dir("move");
        let file = dir.join(FILE_NAME);
        let bytes = b"\xEF\xBB\xBF{ broken".to_vec();
        fs::write(&file, &bytes).unwrap();

        let name = backup_corrupt_at(&file, "20261119-120000").unwrap();
        assert_eq!(name, "quickdeck.json.corrupt-20261119-120000");
        assert!(!file.exists(), "원본 자리는 비워져 새 기본값을 쓸 수 있어야 한다");
        assert_eq!(fs::read(dir.join(&name)).unwrap(), bytes, "보존본은 원본 바이트 그대로");

        // 같은 초에 또 손상되면 번호를 붙이고 이전 보존본은 그대로 둔다
        fs::write(&file, b"second").unwrap();
        let name2 = backup_corrupt_at(&file, "20261119-120000").unwrap();
        assert_eq!(name2, "quickdeck.json.corrupt-20261119-120000-1");
        assert_eq!(fs::read(dir.join(&name)).unwrap(), bytes);
        assert_eq!(fs::read(dir.join(&name2)).unwrap(), b"second");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn backup_fails_without_touching_anything() {
        let dir = temp_dir("fail");
        let file = dir.join(FILE_NAME);
        // 파일이 없으면 실패
        assert!(backup_corrupt_at(&file, "20261119-120000").is_err());
        // 이름 형식이 틀리면 원본을 건드리지 않고 실패
        fs::write(&file, b"keep me").unwrap();
        assert!(backup_corrupt_at(&file, "bad").is_err());
        assert_eq!(fs::read(&file).unwrap(), b"keep me");
        fs::remove_dir_all(dir).unwrap();
    }
}
