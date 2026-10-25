// 13묶음 R1 S-3340·S-3341: API 키는 Windows 자격 증명 관리자에만. 키를 웹뷰로 돌려주는 명령은 없다.
use std::fmt;

/// 키 글자를 가진 새 타입. Debug 는 글자를 찍지 않는다(S-3321)
#[derive(Clone)]
pub struct Secret(String);
impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(•••)")
    }
}
impl Secret {
    #[cfg(test)]
    pub(crate) fn new(s: String) -> Self {
        Secret(s)
    }
    pub(crate) fn expose(&self) -> &str {
        &self.0
    }
}

const USER: &str = "Symvibe";

/// 키를 받는 공급자 id 넷의 자격 증명 대상 이름
pub(crate) fn target_of(provider: &str) -> Option<String> {
    matches!(provider, "api:openai" | "api:anthropic" | "api:gemini" | "api:compat").then(|| format!("Symvibe/planner/{provider}"))
}

/// 앞뒤 공백을 자르고 검사. 실패 문구에 키 글자는 없다
pub(crate) fn valid_key(key: &str) -> Result<String, String> {
    let k = key.trim();
    if k.is_empty() || k.chars().count() > 512 || k.chars().any(|c| c.is_control()) {
        return Err("invalid key".into());
    }
    Ok(k.to_string())
}

#[cfg(windows)]
mod cred {
    use super::{Secret, USER};
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND, FILETIME};
    use windows_sys::Win32::Security::Credentials::{CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }

    pub fn set(target: &str, key: &str) -> Result<(), String> {
        let (t, u) = (wide(target), wide(USER));
        let mut blob = key.as_bytes().to_vec();
        let c = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: t.as_ptr() as *mut u16,
            Comment: null_mut(),
            LastWritten: FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: null_mut(),
            TargetAlias: null_mut(),
            UserName: u.as_ptr() as *mut u16,
        };
        // SAFETY: c 의 포인터는 이 함수 안의 t·u·blob 을 가리키고 호출이 끝나면 쓰지 않는다
        if unsafe { CredWriteW(&c, 0) } == 0 {
            return Err(format!("credential write failed ({})", unsafe { GetLastError() }));
        }
        Ok(())
    }

    pub fn get(target: &str) -> Option<Secret> {
        let t = wide(target);
        let mut p: *mut CREDENTIALW = null_mut();
        // SAFETY: 성공하면 p 가 시스템이 할당한 CREDENTIALW, 블롭을 복사한 뒤 CredFree
        unsafe {
            if CredReadW(t.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p) == 0 || p.is_null() {
                return None;
            }
            let c = &*p;
            let bytes = if c.CredentialBlob.is_null() { Vec::new() } else { std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec() };
            CredFree(p as *const _);
            String::from_utf8(bytes).ok().map(Secret)
        }
    }

    pub fn clear(target: &str) -> Result<(), String> {
        let t = wide(target);
        // SAFETY: t 는 널 끝 UTF-16
        if unsafe { CredDeleteW(t.as_ptr(), CRED_TYPE_GENERIC, 0) } == 0 {
            let e = unsafe { GetLastError() };
            if e != ERROR_NOT_FOUND {
                return Err(format!("credential delete failed ({e})"));
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
pub(crate) fn set_target(target: &str, key: &str) -> Result<(), String> {
    cred::set(target, key)
}
#[cfg(windows)]
pub(crate) fn get_target(target: &str) -> Option<Secret> {
    cred::get(target)
}
#[cfg(windows)]
pub(crate) fn clear_target(target: &str) -> Result<(), String> {
    cred::clear(target)
}
#[cfg(not(windows))]
pub(crate) fn set_target(_target: &str, _key: &str) -> Result<(), String> {
    Err("unsupported".into())
}
#[cfg(not(windows))]
pub(crate) fn get_target(_target: &str) -> Option<Secret> {
    None
}
#[cfg(not(windows))]
pub(crate) fn clear_target(_target: &str) -> Result<(), String> {
    Err("unsupported".into())
}

/// Rust 안에서만(pub(crate)). planner_api 가 헤더에 넣는다
pub(crate) fn get(provider: &str) -> Option<Secret> {
    get_target(&target_of(provider)?)
}

pub fn set(provider: &str, key: &str) -> Result<(), String> {
    let t = target_of(provider).ok_or("invalid provider")?;
    set_target(&t, &valid_key(key)?)
}
pub fn has(provider: &str) -> bool {
    get(provider).is_some()
}
pub fn clear(provider: &str) -> Result<(), String> {
    clear_target(&target_of(provider).ok_or("invalid provider")?)
}

#[tauri::command]
pub async fn planner_key_set(provider: String, key: String) -> Result<(), String> {
    set(&provider, &key)
}
#[tauri::command]
pub async fn planner_key_has(provider: String) -> bool {
    has(&provider)
}
#[tauri::command]
pub async fn planner_key_clear(provider: String) -> Result<(), String> {
    clear(&provider)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_debug_hides_key() {
        let s = Secret("sk-test-ABCDEF123456".into());
        assert_eq!(format!("{:?}", s), "Secret(•••)");
        assert_eq!(s.expose(), "sk-test-ABCDEF123456");
    }

    #[test]
    fn targets_only_for_four_api_providers() {
        assert_eq!(target_of("api:openai").as_deref(), Some("Symvibe/planner/api:openai"));
        assert_eq!(target_of("api:anthropic").as_deref(), Some("Symvibe/planner/api:anthropic"));
        assert_eq!(target_of("api:gemini").as_deref(), Some("Symvibe/planner/api:gemini"));
        assert_eq!(target_of("api:compat").as_deref(), Some("Symvibe/planner/api:compat"));
        assert_eq!(target_of("claude"), None);
        assert_eq!(target_of("api:other"), None);
        assert_eq!(target_of(""), None);
    }

    // S-3340 ⑭: 앞뒤 공백 자름, 빈 글·줄바꿈·제어 문자·512자 초과는 invalid key
    #[test]
    fn valid_key_table() {
        assert_eq!(valid_key("  sk-abc  "), Ok("sk-abc".to_string()));
        assert_eq!(valid_key(&"a".repeat(512)).map(|k| k.len()), Ok(512));
        for bad in ["", "   ", "a\nb", "a\r\nb", "a\tb", "a\u{7f}b"] {
            assert_eq!(valid_key(bad), Err("invalid key".to_string()), "{bad:?}");
        }
        assert_eq!(valid_key(&"a".repeat(513)), Err("invalid key".to_string()));
    }

    #[test]
    fn key_set_rejects_before_writing_and_never_echoes_key() {
        let secret = "line1\nSECRET-KEY-TEXT-777";
        let e = tauri::async_runtime::block_on(planner_key_set("api:openai".into(), secret.into())).unwrap_err();
        assert_eq!(e, "invalid key");
        assert!(!e.contains("SECRET"));
        assert_eq!(tauri::async_runtime::block_on(planner_key_set("api:openai".into(), "".into())), Err("invalid key".to_string()));
        assert_eq!(tauri::async_runtime::block_on(planner_key_set("api:openai".into(), "a".repeat(513))), Err("invalid key".to_string()));
        // api:* 넷만 받는다. 그 밖 공급자는 거부(키 글자 없이)
        let e = set("claude", "sk-test-OK-KEY-123").unwrap_err();
        assert!(!e.contains("sk-test"));
        assert!(!has("claude"));
        assert!(clear("claude").is_err());
    }

    // S-3341 ⑬: 진짜 자격 증명 관리자, 시험 전용 대상. 끝에 꼭 지운다
    #[cfg(windows)]
    #[test]
    fn credential_roundtrip_with_test_target() {
        let ns = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let target = format!("Symvibe/test/{}-{}", std::process::id(), ns);
        let key = "sk-test-roundtrip-한글-123";
        assert!(get_target(&target).is_none());
        let r = (|| {
            set_target(&target, key)?;
            let got = get_target(&target).ok_or("missing after write")?;
            assert_eq!(got.expose(), key);
            set_target(&target, "second-value")?; // 덮어쓰기
            assert_eq!(get_target(&target).unwrap().expose(), "second-value");
            Ok::<(), String>(())
        })();
        let c = clear_target(&target);
        assert!(r.is_ok(), "{r:?}");
        assert!(c.is_ok(), "{c:?}");
        assert!(get_target(&target).is_none());
        assert!(clear_target(&target).is_ok(), "없던 것을 지워도 Ok");
    }
}
