//! Windows 셸이 표시하는 아이콘을 비트맵으로 얻는다.
//!
//! `IShellItemImageFactory::GetImage(SIIGBF_ICONONLY)` 를 쓰므로 exe 의 리소스 아이콘, `.lnk` 가 지정한
//! 별도 아이콘, 파일 형식(연결 프로그램) 아이콘, 폴더 아이콘이 모두 탐색기와 같은 기준으로 나온다.
//! 셸 API 는 COM 을 요구하므로 전용 스레드에서 초기화한 뒤 호출한다 (actions/shell.rs 와 같은 방식).

use std::path::Path;

use image::RgbaImage;
use windows::core::PCWSTR;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{
    DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    HBITMAP, HGDIOBJ,
};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE};
use windows::Win32::UI::Shell::{IShellItemImageFactory, SHCreateItemFromParsingName, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY};

/// 아이콘을 최대 `max_size` px 한 변의 RGBA 이미지로. 실패 시 사람이 읽을 수 있는 원인 문자열.
pub fn extract(path: &Path, max_size: u32) -> Result<RgbaImage, String> {
    let path = path.to_path_buf();
    std::thread::spawn(move || {
        // SAFETY: 이 스레드에서만 COM 을 초기화/해제하고, 모든 핸들은 함수 안에서 해제한다.
        unsafe {
            let com = CoInitializeEx(None, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
            let result = extract_inner(&path, max_size);
            if com.is_ok() {
                CoUninitialize();
            }
            result
        }
    })
    .join()
    .unwrap_or_else(|_| Err("extraction thread panicked".into()))
}

unsafe fn extract_inner(path: &Path, max_size: u32) -> Result<RgbaImage, String> {
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let factory: IShellItemImageFactory =
        SHCreateItemFromParsingName(PCWSTR(wide.as_ptr()), None).map_err(|e| format!("SHCreateItemFromParsingName: {e}"))?;
    let size = SIZE {
        cx: max_size as i32,
        cy: max_size as i32,
    };
    let hbitmap: HBITMAP = factory
        .GetImage(size, SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK)
        .map_err(|e| format!("IShellItemImageFactory::GetImage: {e}"))?;
    let result = bitmap_to_rgba(hbitmap);
    let _ = DeleteObject(HGDIOBJ(hbitmap.0));
    let img = result?;
    Ok(fit(img, max_size))
}

use std::os::windows::ffi::OsStrExt;

/// 32bpp GDI 비트맵을 RGBA 로. 셸이 주는 비트맵은 알파가 곱해진(premultiplied) 경우가 많아 되돌린다.
unsafe fn bitmap_to_rgba(hbitmap: HBITMAP) -> Result<RgbaImage, String> {
    let mut bm = BITMAP::default();
    let got = GetObjectW(
        HGDIOBJ(hbitmap.0),
        std::mem::size_of::<BITMAP>() as i32,
        Some(&mut bm as *mut BITMAP as *mut core::ffi::c_void),
    );
    if got == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0 {
        return Err("GetObjectW failed".into());
    }
    let (w, h) = (bm.bmWidth as u32, bm.bmHeight as u32);
    if w > 1024 || h > 1024 {
        return Err(format!("unexpected bitmap size {w}x{h}"));
    }

    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w as i32,
        biHeight: -(h as i32), // top-down
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let hdc = GetDC(None);
    let lines = GetDIBits(
        hdc,
        hbitmap,
        0,
        h,
        Some(buf.as_mut_ptr() as *mut core::ffi::c_void),
        &mut info,
        DIB_RGB_COLORS,
    );
    ReleaseDC(None, hdc);
    if lines == 0 {
        return Err("GetDIBits failed".into());
    }

    // BGRA → RGBA. 알파 판정: 전부 0 이면 알파 없는 비트맵(불투명), 채널 > 알파인 픽셀이 있으면 straight alpha,
    // 아니면 premultiplied 로 보고 되돌린다.
    let all_zero = buf.chunks_exact(4).all(|p| p[3] == 0);
    let straight = buf.chunks_exact(4).any(|p| p[3] < 255 && (p[0] > p[3] || p[1] > p[3] || p[2] > p[3]));
    let mut out = Vec::with_capacity(buf.len());
    for p in buf.chunks_exact(4) {
        let (b, g, r, a) = (p[0], p[1], p[2], p[3]);
        if all_zero {
            out.extend_from_slice(&[r, g, b, 255]);
        } else if straight || a == 0 || a == 255 {
            out.extend_from_slice(&[r, g, b, a]);
        } else {
            let un = |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
            out.extend_from_slice(&[un(r), un(g), un(b), a]);
        }
    }
    RgbaImage::from_raw(w, h, out).ok_or_else(|| "bitmap buffer size mismatch".into())
}

/// 한 변이 `max` 를 넘으면 비율을 유지하며 줄인다
fn fit(img: RgbaImage, max: u32) -> RgbaImage {
    if img.width() <= max && img.height() <= max {
        return img;
    }
    image::imageops::thumbnail(&img, max.min(img.width()), max.min(img.height()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 실제 Windows 셸에서 메모장 아이콘을 뽑아 본다 (이 크레이트는 Windows 전용)
    #[test]
    fn extracts_notepad_icon_from_shell() {
        let sys = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap();
        let exe = sys.join("System32").join("notepad.exe");
        let img = extract(&exe, 256).expect("notepad icon");
        assert!(img.width() >= 16 && img.width() <= 256, "width {}", img.width());
        assert_eq!(img.width(), img.height());
        // 완전히 투명한 이미지는 아니어야 한다
        assert!(img.pixels().any(|p| p[3] > 0));
    }

    #[test]
    fn extracts_folder_and_file_type_icons() {
        let sys = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap();
        assert!(extract(&sys.join("System32"), 128).is_ok(), "folder icon");
        // 파일 형식 아이콘: 확장자 연결에 따라 나온다 (.txt 는 항상 있음)
        let tmp = std::env::temp_dir().join("quickdeck-icon-test.txt");
        std::fs::write(&tmp, b"x").unwrap();
        let r = extract(&tmp, 64);
        let _ = std::fs::remove_file(&tmp);
        assert!(r.is_ok(), "txt icon: {:?}", r.err());
    }

    #[test]
    fn missing_path_fails_gracefully() {
        let r = extract(Path::new("C:\\없는 폴더 (테스트)\\없음.exe"), 64);
        assert!(r.is_err());
    }
}
