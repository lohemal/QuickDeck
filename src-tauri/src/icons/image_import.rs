//! 사용자 이미지 → 관리 아이콘.
//!
//! 정책
//! - 형식: PNG, JPG/JPEG, WebP, ICO (확장자 + 실제 내용 둘 다 확인). SVG 는 스크립트·외부 리소스 위험 때문에 제외.
//! - 원본 파일 크기 ≤ 10 MB, 디코드 시 픽셀 수·크기 제한(8192×8192, 256 MB) → 초과·손상은 오류.
//! - 원본은 건드리지 않고, 256px 안에 들어가도록 줄인 RGBA PNG 사본을 `custom/c_<uuid>.png` 로 저장한다.
//!   같은 이름의 다른 이미지도 uuid 로 구분되므로 충돌하지 않는다.
//! - 저장은 임시 파일에 쓴 뒤 rename (중간에 꺼져도 깨진 파일이 남지 않게).

use std::path::Path;

use image::{ImageReader, RgbaImage};
use serde::Serialize;
use tauri::AppHandle;

use super::{icons_dir, IconError, CUSTOM_DIR, MAX_ICON_SIZE};
use crate::error::AppResult;

pub const MAX_SOURCE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_DIMENSION: u32 = 8192;
const ALLOWED_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "ico"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedIcon {
    pub file: String,
    pub width: u32,
    pub height: u32,
}

pub fn import_image(app: &AppHandle, source: &Path) -> AppResult<ImportedIcon> {
    let img = load_and_normalize(source)?;
    let id = format!("{CUSTOM_DIR}/c_{}.png", uuid::Uuid::new_v4().simple());
    let target = icons_dir(app)?.join(CUSTOM_DIR).join(id.rsplit('/').next().unwrap());
    save_png_atomic(&img, &target)?;
    log::info!("사용자 아이콘 등록: {} → {} ({}x{})", source.display(), id, img.width(), img.height());
    Ok(ImportedIcon {
        file: id,
        width: img.width(),
        height: img.height(),
    })
}

/// 검증 + 디코드 + 축소. 앱 핸들 없이도 돌아가므로 테스트할 수 있다.
pub fn load_and_normalize(source: &Path) -> Result<RgbaImage, IconError> {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(IconError::Unsupported(ext));
    }
    let meta = std::fs::metadata(source).map_err(|_| IconError::SourceMissing(source.to_path_buf()))?;
    if meta.len() > MAX_SOURCE_BYTES {
        return Err(IconError::TooLarge(meta.len()));
    }

    let mut reader = ImageReader::open(source)
        .map_err(|e| IconError::Corrupt(e.to_string()))?
        .with_guessed_format()
        .map_err(|e| IconError::Corrupt(e.to_string()))?;
    // 확장자와 실제 내용이 다르면(예: .png 로 이름만 바꾼 GIF) 거절한다
    let format_ok = matches!(
        reader.format(),
        Some(image::ImageFormat::Png | image::ImageFormat::Jpeg | image::ImageFormat::WebP | image::ImageFormat::Ico)
    );
    if !format_ok {
        return Err(IconError::Unsupported(format!("{ext} (content: {:?})", reader.format())));
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);

    let decoded = reader.decode().map_err(|e| IconError::Corrupt(e.to_string()))?;
    let rgba = decoded.to_rgba8();
    if rgba.width() == 0 || rgba.height() == 0 {
        return Err(IconError::Corrupt("empty image".into()));
    }
    Ok(fit(rgba, MAX_ICON_SIZE))
}

fn fit(img: RgbaImage, max: u32) -> RgbaImage {
    if img.width() <= max && img.height() <= max {
        return img;
    }
    let scale = (max as f64 / img.width().max(img.height()) as f64).min(1.0);
    let w = ((img.width() as f64 * scale).round() as u32).max(1);
    let h = ((img.height() as f64 * scale).round() as u32).max(1);
    image::imageops::resize(&img, w, h, image::imageops::FilterType::Lanczos3)
}

pub fn save_png_atomic(img: &RgbaImage, target: &Path) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = target.with_extension("png.tmp");
    img.save_with_format(&tmp, image::ImageFormat::Png)
        .map_err(|e| IconError::Corrupt(format!("png encode: {e}")))?;
    std::fs::rename(&tmp, target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, Rgba};

    fn tmp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("quickdeck-icon-tests");
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn sample(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| Rgba([(x % 256) as u8, (y % 256) as u8, 128, 255]))
    }

    #[test]
    fn normalizes_png_jpeg_webp_ico_and_downsizes() {
        let big = sample(1000, 500);
        let p = tmp("big.png");
        big.save(&p).unwrap();
        let out = load_and_normalize(&p).unwrap();
        assert_eq!((out.width(), out.height()), (256, 128), "긴 변 256 으로 비율 유지");

        let small = sample(40, 30);
        let p = tmp("small.jpg");
        DynamicImage::ImageRgba8(small).to_rgb8().save(&p).unwrap();
        let out = load_and_normalize(&p).unwrap();
        assert_eq!((out.width(), out.height()), (40, 30), "작은 이미지는 확대하지 않는다");

        let p = tmp("pic.webp");
        DynamicImage::ImageRgba8(sample(64, 64)).save_with_format(&p, image::ImageFormat::WebP).unwrap();
        assert!(load_and_normalize(&p).is_ok(), "webp");

        let p = tmp("icon.ico");
        DynamicImage::ImageRgba8(sample(48, 48)).save_with_format(&p, image::ImageFormat::Ico).unwrap();
        let out = load_and_normalize(&p).unwrap();
        assert_eq!((out.width(), out.height()), (48, 48), "ico");
    }

    #[test]
    fn rejects_unsupported_corrupt_and_mismatched() {
        let p = tmp("vector.svg");
        std::fs::write(&p, "<svg xmlns='http://www.w3.org/2000/svg'/>").unwrap();
        assert!(matches!(load_and_normalize(&p), Err(IconError::Unsupported(_))));

        let p = tmp("broken.png");
        std::fs::write(&p, b"\x89PNG\r\n\x1a\nnot really a png").unwrap();
        assert!(matches!(load_and_normalize(&p), Err(IconError::Corrupt(_))));

        // 이름만 .png 인 텍스트
        let p = tmp("fake.png");
        std::fs::write(&p, b"hello").unwrap();
        assert!(matches!(load_and_normalize(&p), Err(IconError::Unsupported(_) | IconError::Corrupt(_))));

        assert!(matches!(load_and_normalize(Path::new("C:\\없는\\x.png")), Err(IconError::SourceMissing(_))));
    }

    #[test]
    fn rejects_oversized_source_file() {
        let p = tmp("huge.png");
        let f = std::fs::File::create(&p).unwrap();
        f.set_len(MAX_SOURCE_BYTES + 1).unwrap();
        assert!(matches!(load_and_normalize(&p), Err(IconError::TooLarge(_))));
    }
}
