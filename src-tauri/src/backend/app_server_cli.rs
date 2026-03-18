use serde_json::{json, Value};
use std::env;
use std::ffi::OsString;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::process::Command;
use tokio::time::timeout;

use crate::codex::args::apply_codex_args;

/// Build extra search paths for CLI tools (cross-platform)
fn get_extra_search_paths() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    #[cfg(windows)]
    {
        // Windows-specific paths
        // Use APPDATA directly (most reliable for npm global)
        if let Ok(appdata) = env::var("APPDATA") {
            paths.push(Path::new(&appdata).join("npm"));
        }
        if let Ok(user_profile) = env::var("USERPROFILE") {
            let user_profile = Path::new(&user_profile);
            // Fallback: npm global install path via USERPROFILE
            paths.push(user_profile.join("AppData\\Roaming\\npm"));
            // Cargo bin
            paths.push(user_profile.join(".cargo\\bin"));
            // Bun
            paths.push(user_profile.join(".bun\\bin"));
            // fnm (Fast Node Manager)
            let fnm_root = user_profile.join("AppData\\Local\\fnm\\node-versions");
            if let Ok(entries) = std::fs::read_dir(&fnm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("installation");
                    if bin_path.is_dir() {
                        paths.push(bin_path);
                    }
                }
            }
            // nvm-windows
            let nvm_root = user_profile.join("AppData\\Roaming\\nvm");
            if let Ok(entries) = std::fs::read_dir(&nvm_root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir()
                        && path
                            .file_name()
                            .map_or(false, |n| n.to_string_lossy().starts_with('v'))
                    {
                        paths.push(path);
                    }
                }
            }
        }
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let local_app_data = Path::new(&local_app_data);
            // Volta
            paths.push(local_app_data.join("Volta\\bin"));
            // pnpm
            paths.push(local_app_data.join("pnpm"));
            // User-scoped Node.js installs (common on Windows when not installed to Program Files)
            let programs_root = local_app_data.join("Programs");
            if programs_root.is_dir() {
                paths.push(programs_root.join("nodejs"));
                if let Ok(entries) = std::fs::read_dir(&programs_root) {
                    for entry in entries.flatten() {
                        let candidate = entry.path();
                        if !candidate.is_dir() {
                            continue;
                        }
                        let folder_name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                        if folder_name == "nodejs"
                            || folder_name.starts_with("node-v")
                            || folder_name.starts_with("nodejs-v")
                        {
                            paths.push(candidate);
                        }
                    }
                }
            }
        }
        if let Ok(program_files) = env::var("ProgramFiles") {
            paths.push(Path::new(&program_files).join("nodejs"));
        }
        if let Ok(program_files_x86) = env::var("ProgramFiles(x86)") {
            paths.push(Path::new(&program_files_x86).join("nodejs"));
        }
    }

    #[cfg(not(windows))]
    {
        // Unix-specific paths (macOS/Linux)
        paths.extend(vec![
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
            PathBuf::from("/usr/sbin"),
            PathBuf::from("/sbin"),
        ]);
        if let Ok(home) = env::var("HOME") {
            let home = Path::new(&home);
            paths.push(home.join(".local/bin"));
            paths.push(home.join(".local/share/mise/shims"));
            paths.push(home.join(".cargo/bin"));
            paths.push(home.join(".bun/bin"));
            paths.push(home.join(".volta/bin"));
            // nvm
            let nvm_root = home.join(".nvm/versions/node");
            if let Ok(entries) = std::fs::read_dir(nvm_root) {
                for entry in entries.flatten() {
                    let bin_path = entry.path().join("bin");
                    if bin_path.is_dir() {
                        paths.push(bin_path);
                    }
                }
            }
        }
    }

    paths
}

/// Build combined search paths (system PATH + extra paths)
fn build_search_paths(custom_bin: Option<&str>) -> OsString {
    let mut all_paths: Vec<PathBuf> = Vec::new();

    // Add custom binary's parent directory first (highest priority)
    if let Some(bin_path) = custom_bin.filter(|v| !v.trim().is_empty()) {
        if let Some(parent) = Path::new(bin_path).parent() {
            all_paths.push(parent.to_path_buf());
        }
    }

    // Add system PATH
    if let Ok(system_path) = env::var("PATH") {
        for p in env::split_paths(&system_path) {
            if !all_paths.iter().any(|existing| paths_equal(existing, &p)) {
                all_paths.push(p);
            }
        }
    }

    // Add extra search paths
    for extra in get_extra_search_paths() {
        if extra.is_dir()
            && !all_paths
                .iter()
                .any(|existing| paths_equal(existing, &extra))
        {
            all_paths.push(extra);
        }
    }

    env::join_paths(all_paths).unwrap_or_else(|_| OsString::from(""))
}

/// Compare paths (case-insensitive on Windows)
fn paths_equal(a: &Path, b: &Path) -> bool {
    #[cfg(windows)]
    {
        a.to_string_lossy()
            .eq_ignore_ascii_case(&b.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

/// Find a CLI binary using the `which` crate with extended search paths
/// On Windows, also directly checks for .cmd files in common locations
pub fn find_cli_binary(name: &str, custom_bin: Option<&str>) -> Option<PathBuf> {
    // If custom binary is specified, check if it exists
    if let Some(bin) = custom_bin.filter(|v| !v.trim().is_empty()) {
        let bin_path = Path::new(bin);
        if bin_path.exists() {
            #[cfg(windows)]
            {
                return Some(prefer_windows_executable_variant(bin_path.to_path_buf()));
            }
            #[cfg(not(windows))]
            {
                return Some(bin_path.to_path_buf());
            }
        }
    }

    // On Windows, directly check for .cmd files in known locations first
    // This is more reliable than relying on PATH/PATHEXT
    #[cfg(windows)]
    {
        let extensions = ["cmd", "exe", "bat", "com"];
        for search_path in get_extra_search_paths() {
            // Try with various extensions
            for ext in &extensions {
                let cmd_path = search_path.join(format!("{}.{}", name, ext));
                if cmd_path.exists() {
                    return Some(cmd_path);
                }
            }
        }
    }

    // Build extended search paths for which crate
    let search_paths = build_search_paths(custom_bin);

    // Use which crate to find the binary
    if let Some(cwd) = std::env::current_dir().ok() {
        if let Ok(found) = which::which_in(name, Some(&search_paths), &cwd) {
            #[cfg(windows)]
            {
                return Some(prefer_windows_executable_variant(found));
            }
            return Some(found);
        }
    }

    // Fallback: try standard which (uses system PATH only)
    #[cfg(windows)]
    {
        return which::which(name)
            .ok()
            .map(prefer_windows_executable_variant);
    }
    #[cfg(not(windows))]
    {
        which::which(name).ok()
    }
}

#[cfg(windows)]
fn prefer_windows_executable_variant(path: PathBuf) -> PathBuf {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if matches!(
        ext.as_deref(),
        Some("cmd") | Some("exe") | Some("bat") | Some("com")
    ) {
        return path;
    }

    let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
        return path;
    };
    let Some(parent) = path.parent() else {
        return path;
    };

    for preferred_ext in ["cmd", "exe", "bat", "com"] {
        let candidate = parent.join(format!("{file_name}.{preferred_ext}"));
        if candidate.exists() {
            return candidate;
        }
    }

    path
}

pub(crate) fn build_codex_path_env(codex_bin: Option<&str>) -> Option<String> {
    let paths = build_search_paths(codex_bin);
    let path_str = paths.to_string_lossy().to_string();
    if path_str.is_empty() {
        None
    } else {
        Some(path_str)
    }
}

#[derive(Debug, Clone)]
pub(crate) struct CodexLaunchContext {
    pub(crate) resolved_bin: String,
    pub(crate) wrapper_kind: &'static str,
    pub(crate) path_env: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct CodexAppServerProbeStatus {
    pub(crate) ok: bool,
    pub(crate) status: String,
    pub(crate) details: Option<String>,
    pub(crate) fallback_retried: bool,
}

fn resolve_codex_binary(codex_bin: Option<&str>) -> String {
    if let Some(custom) = codex_bin {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    find_cli_binary("codex", None)
        .or_else(|| find_cli_binary("claude", None))
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| "codex".to_string())
}

pub(crate) fn resolve_codex_launch_context(codex_bin: Option<&str>) -> CodexLaunchContext {
    let resolved_bin = resolve_codex_binary(codex_bin);
    CodexLaunchContext {
        wrapper_kind: wrapper_kind_for_binary(&resolved_bin),
        path_env: build_codex_path_env(codex_bin),
        resolved_bin,
    }
}

pub(crate) fn wrapper_kind_for_binary(bin: &str) -> &'static str {
    let normalized = bin.trim().to_ascii_lowercase();
    if normalized.ends_with(".cmd") {
        "cmd-wrapper"
    } else if normalized.ends_with(".bat") {
        "bat-wrapper"
    } else {
        "direct"
    }
}

#[cfg(windows)]
fn proxy_env_snapshot() -> serde_json::Map<String, Value> {
    [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    ]
    .into_iter()
    .map(|key| (key.to_string(), json!(env::var(key).ok())))
    .collect()
}

#[cfg(not(windows))]
fn proxy_env_snapshot() -> serde_json::Map<String, Value> {
    serde_json::Map::new()
}

/// Get debug information for CLI detection (useful for troubleshooting on Windows)
pub fn get_cli_debug_info(custom_bin: Option<&str>) -> serde_json::Value {
    let mut debug = serde_json::Map::new();
    let launch_context = resolve_codex_launch_context(custom_bin);

    // Platform info
    debug.insert("platform".to_string(), json!(std::env::consts::OS));
    debug.insert("arch".to_string(), json!(std::env::consts::ARCH));
    debug.insert(
        "resolvedBinaryPath".to_string(),
        json!(launch_context.resolved_bin),
    );
    debug.insert(
        "wrapperKind".to_string(),
        json!(launch_context.wrapper_kind),
    );
    debug.insert("pathEnvUsed".to_string(), json!(launch_context.path_env));
    debug.insert(
        "proxyEnvSnapshot".to_string(),
        Value::Object(proxy_env_snapshot()),
    );

    // Environment variables (Windows-specific)
    let env_vars: Vec<(&str, Option<String>)> = vec![
        ("PATH", env::var("PATH").ok()),
        ("USERPROFILE", env::var("USERPROFILE").ok()),
        ("APPDATA", env::var("APPDATA").ok()),
        ("LOCALAPPDATA", env::var("LOCALAPPDATA").ok()),
        ("ProgramFiles", env::var("ProgramFiles").ok()),
        ("HOME", env::var("HOME").ok()),
    ];
    let env_info: serde_json::Map<String, serde_json::Value> = env_vars
        .into_iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    debug.insert("envVars".to_string(), json!(env_info));

    // Extra search paths and their existence
    let extra_paths = get_extra_search_paths();
    let extra_paths_info: Vec<serde_json::Value> = extra_paths
        .iter()
        .map(|p| {
            // Also check if CLI files exist in this path
            let codex_cmd = p.join("codex.cmd");
            let claude_cmd = p.join("claude.cmd");
            json!({
                "path": p.to_string_lossy(),
                "exists": p.exists(),
                "isDir": p.is_dir(),
                "hasCodexCmd": codex_cmd.exists(),
                "hasClaudeCmd": claude_cmd.exists()
            })
        })
        .collect();
    debug.insert("extraSearchPaths".to_string(), json!(extra_paths_info));

    // Try to find claude and codex binaries
    let claude_found = find_cli_binary("claude", custom_bin);
    let codex_found = find_cli_binary("codex", custom_bin);
    debug.insert(
        "claudeFound".to_string(),
        json!(claude_found.map(|p| p.to_string_lossy().to_string())),
    );
    debug.insert(
        "codexFound".to_string(),
        json!(codex_found.map(|p| p.to_string_lossy().to_string())),
    );

    // Also try standard which without extra paths
    let claude_standard = which::which("claude").ok();
    let codex_standard = which::which("codex").ok();
    debug.insert(
        "claudeStandardWhich".to_string(),
        json!(claude_standard.map(|p| p.to_string_lossy().to_string())),
    );
    debug.insert(
        "codexStandardWhich".to_string(),
        json!(codex_standard.map(|p| p.to_string_lossy().to_string())),
    );

    // Custom binary info
    debug.insert("customBin".to_string(), json!(custom_bin));

    // Combined search paths
    let search_paths = build_search_paths(custom_bin);
    debug.insert(
        "combinedSearchPaths".to_string(),
        json!(search_paths.to_string_lossy()),
    );

    serde_json::Value::Object(debug)
}

/// Build a command that correctly handles .cmd files on Windows.
/// Uses CREATE_NO_WINDOW to prevent visible console windows.
pub fn build_command_for_binary_with_console(bin: &str, hide_console: bool) -> Command {
    #[cfg(windows)]
    {
        // On Windows, .cmd files need to be run through cmd.exe
        let bin_lower = bin.to_lowercase();
        if bin_lower.ends_with(".cmd") || bin_lower.ends_with(".bat") {
            let mut cmd = crate::utils::async_command_with_console_visibility("cmd", hide_console);
            cmd.arg("/c");
            cmd.arg(bin);
            return cmd;
        }
    }
    crate::utils::async_command_with_console_visibility(bin, hide_console)
}

pub fn build_command_for_binary(bin: &str) -> Command {
    build_command_for_binary_with_console(bin, true)
}

pub(crate) fn build_codex_command_from_launch_context(
    launch_context: &CodexLaunchContext,
    hide_console: bool,
) -> Command {
    let mut command =
        build_command_for_binary_with_console(&launch_context.resolved_bin, hide_console);
    if let Some(path_env) = &launch_context.path_env {
        command.env("PATH", path_env);
    }
    command
}

pub(crate) fn build_codex_command_with_bin(codex_bin: Option<String>) -> Command {
    let launch_context = resolve_codex_launch_context(codex_bin.as_deref());
    build_codex_command_from_launch_context(&launch_context, true)
}

/// Check if a specific CLI binary is available and return its version
async fn check_cli_binary(bin: &str, path_env: Option<String>) -> Result<Option<String>, String> {
    async fn run_cli_version_check_once(
        launch_context: &CodexLaunchContext,
        hide_console: bool,
    ) -> Result<Option<String>, String> {
        let mut command =
            build_command_for_binary_with_console(&launch_context.resolved_bin, hide_console);
        if let Some(path) = &launch_context.path_env {
            command.env("PATH", path);
        }
        command.arg("--version");
        command.stdout(std::process::Stdio::piped());
        command.stderr(std::process::Stdio::piped());

        let output = match timeout(Duration::from_secs(5), command.output()).await {
            Ok(result) => match result {
                Ok(out) => out,
                Err(e) => {
                    if e.kind() == ErrorKind::NotFound {
                        return Err("not_found".to_string());
                    }
                    return Err(e.to_string());
                }
            },
            Err(_) => {
                return Err("timeout".to_string());
            }
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let detail = if stderr.trim().is_empty() {
                stdout.trim()
            } else {
                stderr.trim()
            };
            if detail.is_empty() {
                return Err("failed".to_string());
            }
            return Err(format!("failed: {detail}"));
        }

        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if version.is_empty() {
            None
        } else {
            Some(version)
        })
    }

    let mut launch_context = resolve_codex_launch_context(Some(bin));
    launch_context.path_env = path_env;

    match run_cli_version_check_once(&launch_context, true).await {
        Ok(version) => Ok(version),
        Err(primary_error) => {
            if !can_retry_wrapper_launch(&launch_context) {
                return Err(primary_error);
            }
            run_cli_version_check_once(&launch_context, false)
                .await
                .map_err(|retry_error| {
                    format!(
                        "Primary wrapper launch failed: {primary_error}\nFallback retry failed: {retry_error}"
                    )
                })
        }
    }
}

#[allow(dead_code)]
pub(crate) fn visible_console_fallback_enabled_from_env(value: Option<&str>) -> bool {
    matches!(value, Some("1") | Some("true"))
}

#[cfg(windows)]
fn allow_wrapper_visible_console_fallback() -> bool {
    visible_console_fallback_enabled_from_env(env::var("CODEMOSS_SHOW_CONSOLE").ok().as_deref())
}

#[cfg(windows)]
pub(crate) fn can_retry_wrapper_launch(launch_context: &CodexLaunchContext) -> bool {
    launch_context.wrapper_kind != "direct" && allow_wrapper_visible_console_fallback()
}

#[cfg(not(windows))]
pub(crate) fn can_retry_wrapper_launch(_launch_context: &CodexLaunchContext) -> bool {
    false
}

async fn run_codex_app_server_probe_once(
    launch_context: &CodexLaunchContext,
    codex_args: Option<&str>,
    hide_console: bool,
) -> Result<(), String> {
    let mut command = build_codex_command_from_launch_context(launch_context, hide_console);
    apply_codex_args(&mut command, codex_args)?;
    command.arg("app-server");
    command.arg("--help");
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let output = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map_err(|err| err.to_string())?,
        Err(_) => {
            return Err("Timed out while checking `codex app-server --help`.".to_string());
        }
    };

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        Err("`codex app-server --help` exited with a non-zero status.".to_string())
    } else {
        Err(detail.to_string())
    }
}

pub(crate) async fn probe_codex_app_server(
    codex_bin: Option<String>,
    codex_args: Option<&str>,
) -> Result<CodexAppServerProbeStatus, String> {
    let launch_context = resolve_codex_launch_context(codex_bin.as_deref());
    match run_codex_app_server_probe_once(&launch_context, codex_args, true).await {
        Ok(()) => Ok(CodexAppServerProbeStatus {
            ok: true,
            status: "ok".to_string(),
            details: None,
            fallback_retried: false,
        }),
        Err(primary_error) => {
            if !can_retry_wrapper_launch(&launch_context) {
                return Ok(CodexAppServerProbeStatus {
                    ok: false,
                    status: "failed".to_string(),
                    details: Some(primary_error),
                    fallback_retried: false,
                });
            }

            match run_codex_app_server_probe_once(&launch_context, codex_args, false).await {
                Ok(()) => Ok(CodexAppServerProbeStatus {
                    ok: true,
                    status: "fallback-ok".to_string(),
                    details: Some(primary_error),
                    fallback_retried: true,
                }),
                Err(retry_error) => Ok(CodexAppServerProbeStatus {
                    ok: false,
                    status: "fallback-failed".to_string(),
                    details: Some(format!(
                        "Primary wrapper launch failed: {primary_error}\nFallback retry failed: {retry_error}"
                    )),
                    fallback_retried: true,
                }),
            }
        }
    }
}

pub(crate) async fn check_codex_installation(
    codex_bin: Option<String>,
) -> Result<Option<String>, String> {
    let path_env = build_codex_path_env(codex_bin.as_deref());

    // If user specified a custom binary path, use it directly
    if let Some(ref bin) = codex_bin {
        if !bin.trim().is_empty() {
            return match check_cli_binary(bin, path_env).await {
                Ok(version) => Ok(version),
                Err(e) if e == "not_found" => Err(format!(
                    "CLI not found at '{}'. Please check the path is correct.",
                    bin
                )),
                Err(e) if e == "timeout" => Err(format!(
                    "Timed out while checking CLI at '{}'. Make sure it runs in Terminal.",
                    bin
                )),
                Err(e) if e == "failed" => Err(format!(
                    "CLI at '{}' failed to start. Try running it in Terminal.",
                    bin
                )),
                Err(e) => Err(format!("CLI at '{}' failed: {}", bin, e)),
            };
        }
    }

    // Try to find Codex CLI first using our enhanced search (supports app-server)
    if let Some(codex_path) = find_cli_binary("codex", None) {
        let codex_bin = codex_path.to_string_lossy().to_string();
        if let Ok(version) = check_cli_binary(&codex_bin, path_env.clone()).await {
            return Ok(version);
        }
    }

    // Try Claude Code CLI as fallback using our enhanced search
    if let Some(claude_path) = find_cli_binary("claude", None) {
        let claude_bin = claude_path.to_string_lossy().to_string();
        if let Ok(version) = check_cli_binary(&claude_bin, path_env.clone()).await {
            return Ok(version);
        }
    }

    // Last resort: try simple command names (relies on PATH)
    let codex_result = check_cli_binary("codex", path_env.clone()).await;
    if let Ok(version) = codex_result {
        return Ok(version);
    }

    let claude_result = check_cli_binary("claude", path_env).await;
    if let Ok(version) = claude_result {
        return Ok(version);
    }

    // Both CLIs not found - return helpful error message
    Err(
        "CLI_NOT_FOUND: Neither Claude Code CLI nor Codex CLI was found. Please install one of them:\n\
         - Claude Code: npm install -g @anthropic-ai/claude-code\n\
         - Codex: npm install -g @openai/codex"
            .to_string(),
    )
}
