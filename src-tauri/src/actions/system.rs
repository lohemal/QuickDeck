//! Windows 시스템 기능.
//!
//! | 기능 | 방식 |
//! |---|---|
//! | 미디어·볼륨 | `SendInput` 으로 VK_MEDIA_* / VK_VOLUME_* 키 입력. 시스템이 처리하므로 포커스와 무관 |
//! | 화면 잠금 | `LockWorkStation` |
//! | 절전 | `SetSuspendState(hibernate=false)` |
//! | 로그아웃·재시작·종료 | `shutdown.exe` 를 인자 배열로 실행 (셸 미사용) |
//! | 탐색기 | `explorer.exe` |
//! | Windows 설정 / 캡처 도구 | `ms-settings:` / `ms-screenclip:` URI 를 ShellExecute |
//! | 작업 관리자 | `taskmgr.exe` 를 ShellExecute |

use std::process::Command;

use windows::Win32::Foundation::GetLastError;
use windows::Win32::System::Power::SetSuspendState;
use windows::Win32::System::Shutdown::LockWorkStation;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    VK_MEDIA_NEXT_TRACK, VK_MEDIA_PLAY_PAUSE, VK_MEDIA_PREV_TRACK, VK_VOLUME_DOWN, VK_VOLUME_MUTE, VK_VOLUME_UP,
};

use super::shell::shell_execute;
use super::ExecError;
use crate::model::SystemCommand;

pub fn run(cmd: SystemCommand) -> Result<(), ExecError> {
    use SystemCommand::*;
    match cmd {
        PlayPause => send_key(VK_MEDIA_PLAY_PAUSE),
        PrevTrack => send_key(VK_MEDIA_PREV_TRACK),
        NextTrack => send_key(VK_MEDIA_NEXT_TRACK),
        VolumeUp => send_key(VK_VOLUME_UP),
        VolumeDown => send_key(VK_VOLUME_DOWN),
        Mute => send_key(VK_VOLUME_MUTE),

        LockScreen => lock_workstation(),
        Sleep => suspend(),
        LogOff | Restart | Shutdown => {
            let (program, args) = power_command(cmd);
            spawn(program, args)
        }

        FileExplorer => spawn("explorer.exe", &[]),
        WindowsSettings => open_uri("ms-settings:"),
        TaskManager => shell_execute("taskmgr.exe", None, None).map_err(|code| ExecError::Shell {
            target: "taskmgr.exe".into(),
            code,
        }),
        // Windows 10/11 의 캡처 도구 오버레이. 없는 환경이면 예전 캡처 도구로
        ScreenCapture => open_uri("ms-screenclip:").or_else(|_| open_uri("snippingtool.exe")),
    }
}

/// 로그아웃·재시작·종료에 쓰는 프로그램과 인자. 실행 없이 검증할 수 있게 분리했다.
pub fn power_command(cmd: SystemCommand) -> (&'static str, &'static [&'static str]) {
    match cmd {
        SystemCommand::LogOff => ("shutdown.exe", &["/l"]),
        SystemCommand::Restart => ("shutdown.exe", &["/r", "/t", "0"]),
        SystemCommand::Shutdown => ("shutdown.exe", &["/s", "/t", "0"]),
        other => unreachable!("power_command called with {other:?}"),
    }
}

fn spawn(program: &str, args: &[&str]) -> Result<(), ExecError> {
    Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|source| ExecError::Launch {
            what: program.to_owned(),
            source,
        })
}

fn open_uri(uri: &str) -> Result<(), ExecError> {
    shell_execute(uri, None, None).map_err(|code| ExecError::Shell {
        target: uri.to_owned(),
        code,
    })
}

/// 키를 눌렀다 뗀다. 미디어·볼륨 키는 시스템(셸)이 가로채 처리하므로 어느 창에 포커스가 있어도 동작한다.
fn send_key(vk: VIRTUAL_KEY) -> Result<(), ExecError> {
    let make = |flags: KEYBD_EVENT_FLAGS| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    let inputs = [make(KEYBD_EVENT_FLAGS(0)), make(KEYEVENTF_KEYUP)];
    // SAFETY: inputs 는 올바르게 채워진 INPUT 배열이고 크기를 함께 넘긴다.
    let sent = unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(ExecError::Api {
            api: "SendInput",
            detail: format!("sent {sent}/2, GetLastError={:?}", unsafe { GetLastError() }),
        })
    }
}

fn lock_workstation() -> Result<(), ExecError> {
    // SAFETY: 인자 없는 단순 호출
    unsafe { LockWorkStation() }.map_err(|e| ExecError::Api {
        api: "LockWorkStation",
        detail: e.to_string(),
    })
}

fn suspend() -> Result<(), ExecError> {
    // hibernate=false → 절전(S3/Modern Standby). force=false, wake-events-disabled=false
    // SAFETY: 단순 호출
    let ok: bool = unsafe { SetSuspendState(false, false, false) };
    if ok {
        Ok(())
    } else {
        Err(ExecError::Api {
            api: "SetSuspendState",
            detail: format!("GetLastError={:?}", unsafe { GetLastError() }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 실제로 실행하지 않고 명령 구성만 검증한다 (개발 환경을 끊지 않기 위해).
    #[test]
    fn power_commands_are_built_without_running() {
        assert_eq!(power_command(SystemCommand::LogOff), ("shutdown.exe", &["/l"][..]));
        assert_eq!(power_command(SystemCommand::Restart), ("shutdown.exe", &["/r", "/t", "0"][..]));
        assert_eq!(power_command(SystemCommand::Shutdown), ("shutdown.exe", &["/s", "/t", "0"][..]));
    }

    #[test]
    fn shutdown_exe_exists_on_this_machine() {
        let sys = std::env::var_os("SystemRoot").map(std::path::PathBuf::from).unwrap();
        assert!(sys.join("System32").join("shutdown.exe").is_file());
    }
}
