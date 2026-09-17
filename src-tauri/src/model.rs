//! 프론트엔드 `src/ipc/actions.ts` 의 `ExecutableAction` 과 같은 모양이어야 한다.
//! (검색은 프론트엔드에서 URL 을 만들어 `Website` 로 보내므로 여기에는 없다)

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Browser {
    Default,
    Edge,
    Chrome,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SystemCommand {
    PlayPause,
    PrevTrack,
    NextTrack,
    VolumeUp,
    VolumeDown,
    Mute,
    LockScreen,
    Sleep,
    LogOff,
    Restart,
    Shutdown,
    FileExplorer,
    WindowsSettings,
    TaskManager,
    ScreenCapture,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Action {
    Website {
        url: String,
        browser: Browser,
    },
    Program {
        path: String,
        #[serde(default)]
        args: Vec<String>,
    },
    File {
        path: String,
    },
    Folder {
        path: String,
    },
    System {
        command: SystemCommand,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deserializes_frontend_shape() {
        let a: Action =
            serde_json::from_str(r#"{"type":"website","url":"https://a.b","browser":"edge"}"#).unwrap();
        assert!(matches!(a, Action::Website { browser: Browser::Edge, .. }));

        let a: Action = serde_json::from_str(r#"{"type":"program","path":"C:\\x.exe"}"#).unwrap();
        assert!(matches!(a, Action::Program { ref args, .. } if args.is_empty()));

        let a: Action = serde_json::from_str(r#"{"type":"system","command":"play-pause"}"#).unwrap();
        assert!(matches!(a, Action::System { command: SystemCommand::PlayPause }));
    }
}
