//! 로컬 데이터 파일. 위치: `%APPDATA%\kr.lohemal.quickdeck\quickdeck.json`
//!
//! Rust 는 내용 구조를 해석하지 않는다. 구조(스키마·마이그레이션)의 단일 기준은
//! 프론트엔드 `src/model/appData.ts` 다. 여기서는 올바른 JSON 인지만 확인하고
//! 임시 파일에 쓴 뒤 교체해 저장 도중 꺼져도 기존 파일이 깨지지 않게 한다.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

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
