pub mod agent_logs;
pub mod agents;
pub mod boards;
pub mod conversations;
pub mod custom_agents;
pub mod diagram;
pub mod fs;
pub mod gh;
pub mod git;
pub mod goal;
pub mod livestatus;
pub mod lifecycle;
pub mod memory;
pub mod presets;
pub mod library; // E6 Documents 보관
pub mod loops;
pub mod pdf;
pub mod profiles;
pub mod pty;
pub mod repo_info;
pub mod repo_setup;
pub mod resume;
pub mod suspend;
pub mod threads;
pub mod studio;
pub mod skills;
pub mod subagents;
pub mod web;
pub mod tokens;
pub mod transcripts;
pub mod settings;
pub mod voice;
pub mod secrets; // 13묶음 R1
pub mod planner_api;

use pty::PtyManager;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::State;

// async: 동기 명령은 메인(UI) 스레드에서 돈다. ConPTY+프로세스 생성이 콘솔마다 UI를 멈춰 preset 으로 여러 개 열면 버벅였다
#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn pty_spawn(
    state: State<'_, PtyManager>,
    program: Option<String>,
    args: Option<Vec<String>>,
    env: Option<Vec<(String, String)>>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<InvokeResponseBody>,
    on_exit: Channel<serde_json::Value>,
) -> Result<u32, String> {
    state.spawn(
        program.as_deref().unwrap_or(""),
        &args.unwrap_or_default(),
        &env.unwrap_or_default(),
        cwd.as_deref(),
        cols,
        rows,
        // 원시 바이트 그대로 → JS에서 ArrayBuffer (S-102)
        Box::new(move |chunk| {
            let _ = on_data.send(InvokeResponseBody::Raw(chunk));
        }),
        Box::new(move |code| {
            let _ = on_exit.send(serde_json::json!({ "code": code }));
        }),
    )
}

#[tauri::command]
async fn pty_write(state: State<'_, PtyManager>, id: u32, data: String) -> Result<(), String> {
    state.write(id, data.as_bytes())
}

#[tauri::command]
async fn pty_set_batch(state: State<'_, PtyManager>, id: u32, low_spec: bool, visible: bool) -> Result<(), String> {
    state.set_batch(id, low_spec, visible);
    Ok(())
}

#[tauri::command]
async fn pty_resize(state: State<'_, PtyManager>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    state.resize(id, cols, rows)
}

#[tauri::command]
async fn pty_kill(state: State<'_, PtyManager>, id: u32) -> Result<(), String> {
    state.kill(id)
}

#[tauri::command]
async fn pty_pause(state: State<'_, PtyManager>, id: u32) -> Result<(), String> {
    state.pause(id)
}

#[tauri::command]
async fn pty_resume(state: State<'_, PtyManager>, id: u32) -> Result<(), String> {
    state.resume(id)
}

/// S-232: 앱 자신을 Job Object에 넣어, 앱이 죽으면 모든 자식(콘솔)도 정리되게 한다.
/// ponytail: job 안 자식은 자기가 breakaway(CREATE_BREAKAWAY_FROM_JOB) 하지 않으면 앱과 같이 죽는다.
/// 앱보다 오래 살아야 하는 자식이 생기면 그 spawn에만 breakaway 플래그를 준다.
#[cfg(windows)]
fn join_kill_on_close_job() {
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_BREAKAWAY_OK, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    // SAFETY: Win32 호출, 핸들은 일부러 닫지 않음(프로세스가 끝날 때 닫혀야 자식이 정리됨)
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
        SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        AssignProcessToJobObject(job, GetCurrentProcess());
    }
}

/// 시작 창 (논리 너비, 논리 높이, 왼쪽 위 물리 x, y). 작업 영역(물리 px)과 배율로 계산
fn start_rect(wx: i32, wy: i32, ww: u32, wh: u32, scale: f64) -> (f64, f64, i32, i32) {
    let w = (ww as f64 / scale - 16.0).min(1280.0);
    let h = (wh as f64 / scale - 16.0).min(800.0);
    let x = wx + ((ww as f64 - w * scale) / 2.0) as i32;
    let y = wy + ((wh as f64 - h * scale) / 2.0) as i32;
    (w, h, x, y)
}

#[cfg(test)]
mod start_rect_tests {
    use super::start_rect;
    #[test]
    fn fhd_100() {
        // 작업 영역 1920x1040(작업 표시줄 40) → 1280x800, 가운데
        assert_eq!(start_rect(0, 0, 1920, 1040, 1.0), (1280.0, 800.0, 320, 120));
    }
    #[test]
    fn hd_1366_150() {
        // 1366x768@150%, 작업 영역 1366x728 → 논리 910.67x485.33, 여백 16
        let (w, h, x, y) = start_rect(0, 0, 1366, 728, 1.5);
        assert!((w - (1366.0 / 1.5 - 16.0)).abs() < 1e-6 && (h - (728.0 / 1.5 - 16.0)).abs() < 1e-6);
        assert!(x >= 0 && y >= 0 && x + (w * 1.5) as i32 <= 1366 && y + (h * 1.5) as i32 <= 728);
        assert_eq!(x, ((1366.0 - w * 1.5) / 2.0) as i32);
    }
    #[test]
    fn big_2560() {
        assert_eq!(start_rect(0, 0, 2560, 1392, 1.0), (1280.0, 800.0, 640, 296));
    }
}

pub fn run() {
    // 시험(cargo test)은 run()을 부르지 않으므로 job에 들어가지 않는다
    #[cfg(windows)]
    join_kill_on_close_job();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(lifecycle::on_window_event)
        .manage(PtyManager::default())
        .manage(agents::cmds::AgentCache::default())
        .manage(livestatus::cmds::LiveState::default())
        .manage(repo_setup::Jobs::default())
        .manage(voice::Voice::default())
        .manage(planner_api::PlannerApi::default())
        .setup(|app| {
            // S-169: 시작 때 에이전트 설치 여부를 한 번 찾아 둔다
            use tauri::Manager;
            // S-2628: 시작 크기 = min(1280x800, 작업 영역 - 16)·가운데(논리 픽셀). 작업 표시줄·150% 배율에서 아래가 잘리지 않게
            if let Some(w) = app.get_webview_window("main") {
                if let Ok(Some(m)) = w.current_monitor() {
                    let a = m.work_area();
                    let (lw, lh, x, y) = start_rect(a.position.x, a.position.y, a.size.width, a.size.height, m.scale_factor());
                    let _ = w.set_size(tauri::LogicalSize::new(lw, lh));
                    let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
                }
            }
            let cache = app.state::<agents::cmds::AgentCache>().inner().clone();
            // S-2214·S-2215: 지난 실행의 임시 wav·받다 만 파일을 지운다
            if let Ok(d) = voice::voice_dir(app.handle()) {
                voice::clean_tmp(&d);
            }
            let file = settings::file(app.handle());
            std::thread::spawn(move || cache.refresh(&file.map(|f| settings::load(&f)).unwrap_or_default()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_set_batch,
            pty_kill,
            pty_pause,
            pty_resume,
            agents::cmds::agents_list,
            agents::cmds::agent_spawn_spec,
            agents::cmds::default_agent,
            agents::cmds::current_shell,
            custom_agents::custom_agents_get,
            custom_agents::custom_agents_set,
            tokens::tokens_scan,
            tokens::usage_stats,
            tokens::tokens_cancel,
            settings::settings_get,
            settings::usage_probe_dir,
            settings::planner_dir,
            settings::settings_set,
            boards::board_load,
            boards::board_save,
            boards::board_archive,
            boards::repos_get,
            boards::repos_set,
            boards::dir_exists,
            conversations::conversations_list,
            resume::claude_transcript_exists_cmd,
            resume::codex_find_session_cmd,
            lifecycle::app_quit,
            repo_info::repo_branch,
            gh::gh_status,
            gh::gh_logout,
            pdf::pdf_export,
            pdf::pdf_temp_dir,
            pdf::export_write,
            diagram::diagram_put,
            diagram::diagram_get,
            diagram::diagram_delete,
            library::cmds::doc_list, // E6 Documents 보관
            library::cmds::doc_put,
            library::cmds::doc_get,
            library::cmds::doc_delete,
            threads::thread_load,
            threads::thread_save,
            presets::presets_get,
            presets::presets_set,
            loops::loops_get,
            loops::loops_set,
            memory::memory_load,
            memory::memory_save,
            profiles::profile_list,
            profiles::profile_create,
            profiles::profile_env,
            profiles::profile_remove,
            profiles::profile_status,
            profiles::profile_rename,
            goal::goal_run,
            livestatus::cmds::live_status_paths,
            livestatus::cmds::live_status_url,
            livestatus::cmds::live_status_enable,
            livestatus::cmds::live_status_disable,
            livestatus::cmds::live_status_install_profile,
            repo_setup::home_dirs,
            repo_setup::git_clone,
            repo_setup::git_clone_status,
            repo_setup::git_cancel,
            repo_setup::git_init,
            repo_setup::git_init_here,
            git::cmds::git_branch_delete,
            git::cmds::git_branch_new,
            git::cmds::git_switch,
            git::cmds::git_branches,
            git::cmds::git_publish,
            git::cmds::git_remove_oversize,
            git::cmds::git_keep_off,
            git::cmds::git_oversize,
            git::cmds::git_discard,
            git::cmds::git_pull,
            git::cmds::git_push,
            git::cmds::git_commit,
            git::cmds::git_log,
            git::cmds::git_status,
            transcripts::last_reply_cmd,
            agent_logs::agent_find_session,
            secrets::planner_key_set,
            secrets::planner_key_has,
            secrets::planner_key_clear,
            planner_api::planner_api_ask,
            planner_api::planner_api_models,
            planner_api::planner_api_cancel,

            subagents::claude_subagents_cmd,
            transcripts::outputs_save_cmd,
            fs::file_read,
            fs::file_stat,
            fs::file_text,
            fs::dir_files,
            fs::file_copy_into,
            fs::image_save,
            fs::fs_open,
            fs::fs_reveal,
            fs::trash_move,
            fs::open_url,
            studio::cmds::studio_tree,
            studio::cmds::studio_read,
            studio::cmds::studio_write,
            studio::cmds::studio_create,
            studio::cmds::studio_rename,
            studio::cmds::studio_duplicate,
            studio::cmds::studio_vault,
            studio::cmds::studio_memory_dir,
            studio::cmds::draft_put,
            studio::cmds::draft_get,
            studio::cmds::draft_clear,
            skills::skills_scan,
            skills::skills_write,
            skills::skills_create,
            skills::skills_import_check,
            skills::skills_import,
            skills::skills_duplicate,
            skills::skills_delete,
            web::web_ports,
            web::web_probe,
            web::web_window_open,
            web::web_window_close,
            voice::voice_status,
            voice::voice_download,
            voice::voice_cancel,
            voice::voice_folder,
            voice::voice_transcribe,
            voice::piper::piper_status,
            voice::piper::piper_speak
        ])
        .run(tauri::generate_context!())
        .expect("Tauri 실행 실패");
}
