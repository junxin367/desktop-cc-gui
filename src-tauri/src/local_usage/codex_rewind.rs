use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::sync::Mutex;

use crate::types::WorkspaceEntry;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CodexRewindCommitResult {
    pub deleted_count: usize,
}

fn has_invalid_session_id_path_chars(value: &str) -> bool {
    value.contains('/') || value.contains('\\') || value.contains("..")
}

fn build_cross_platform_session_file_component(session_id: &str) -> String {
    let mut sanitized: String = session_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    sanitized = sanitized.trim_matches('_').to_string();
    if sanitized.is_empty() {
        sanitized = "session".to_string();
    }
    if sanitized == session_id {
        return sanitized;
    }

    let mut hasher = DefaultHasher::new();
    session_id.hash(&mut hasher);
    let digest = hasher.finish();
    format!("{sanitized}-{digest:016x}")
}

fn source_file_sort_key(path: &Path) -> (u128, String) {
    let modified_ms = fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    (modified_ms, path.to_string_lossy().to_string())
}

pub(crate) async fn commit_codex_rewind_for_workspace(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    source_session_id: &str,
    target_session_id: &str,
    target_user_turn_index: usize,
    target_user_message_id: Option<String>,
    local_user_message_count: Option<usize>,
) -> Result<CodexRewindCommitResult, String> {
    let workspace_id = workspace_id.trim().to_string();
    let source_session_id = source_session_id.trim().to_string();
    let target_session_id = target_session_id.trim().to_string();
    let target_user_message_id = target_user_message_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if workspace_id.is_empty() {
        return Err("workspace_id is required".to_string());
    }
    if source_session_id.is_empty() {
        return Err("source_session_id is required".to_string());
    }
    if has_invalid_session_id_path_chars(&source_session_id) {
        return Err("invalid source_session_id".to_string());
    }
    if target_session_id.is_empty() {
        return Err("target_session_id is required".to_string());
    }
    if has_invalid_session_id_path_chars(&target_session_id) {
        return Err("invalid target_session_id".to_string());
    }
    if target_user_turn_index == 0 {
        return Err("target_user_turn_index must be >= 1 for codex rewind".to_string());
    }

    let (workspace_path, sessions_roots) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .ok_or_else(|| "workspace not found".to_string())?;
        let workspace_path = PathBuf::from(&entry.path);
        let sessions_roots =
            super::resolve_sessions_roots(&workspaces, Some(workspace_path.as_path()));
        (workspace_path, sessions_roots)
    };

    tokio::task::spawn_blocking(move || {
        commit_codex_rewind(
            workspace_path.as_path(),
            &sessions_roots,
            source_session_id.as_str(),
            target_session_id.as_str(),
            target_user_turn_index,
            target_user_message_id.as_deref(),
            local_user_message_count,
        )
    })
    .await
    .map_err(|err| err.to_string())?
}

fn commit_codex_rewind(
    workspace_path: &Path,
    sessions_roots: &[PathBuf],
    source_session_id: &str,
    target_session_id: &str,
    target_user_turn_index: usize,
    target_user_message_id: Option<&str>,
    local_user_message_count: Option<usize>,
) -> Result<CodexRewindCommitResult, String> {
    let source_files = super::collect_matching_codex_session_files(
        source_session_id,
        workspace_path,
        sessions_roots,
    )?;
    let source_file = source_files
        .iter()
        .max_by_key(|path| source_file_sort_key(path))
        .cloned()
        .ok_or_else(|| {
            format!(
                "codex session file not found for session {}",
                source_session_id
            )
        })?;

    let existing_target_files =
        collect_optional_codex_session_files(target_session_id, workspace_path, sessions_roots)?;
    for path in &existing_target_files {
        fs::remove_file(path).map_err(|err| {
            format!(
                "failed to remove pre-existing codex rewind target {}: {}",
                path.display(),
                err
            )
        })?;
    }

    let target_parent = source_file
        .parent()
        .map(PathBuf::from)
        .ok_or_else(|| "invalid codex session file path".to_string())?;
    fs::create_dir_all(&target_parent).map_err(|err| {
        format!(
            "failed to prepare codex rewind directory {}: {}",
            target_parent.display(),
            err
        )
    })?;
    let target_file_component = build_cross_platform_session_file_component(target_session_id);
    let target_file = target_parent.join(format!("rewind-{target_file_component}.jsonl"));
    let temp_target_file = target_parent.join(format!("rewind-{target_file_component}.jsonl.tmp"));
    if temp_target_file.exists() {
        let _ = fs::remove_file(&temp_target_file);
    }

    let source_handle = File::open(&source_file).map_err(|err| {
        format!(
            "failed to open codex session file {}: {}",
            source_file.display(),
            err
        )
    })?;
    let mut source_aliases = HashSet::new();
    source_aliases.insert(source_session_id.to_string());
    if let Some(file_stem) = source_file.file_stem().and_then(|value| value.to_str()) {
        let normalized = file_stem.trim();
        if !normalized.is_empty() {
            source_aliases.insert(normalized.to_string());
        }
    }

    let mut source_lines = Vec::new();
    let reader = BufReader::new(source_handle);
    for line in reader.lines() {
        source_lines.push(line.map_err(|err| err.to_string())?);
    }

    let truncate_from_line = resolve_codex_rewind_boundary_line(
        &source_lines,
        target_user_turn_index,
        target_user_message_id,
        local_user_message_count,
        source_session_id,
    )?;

    let mut target_handle = File::create(&temp_target_file).map_err(|err| {
        format!(
            "failed to create codex rewind target {}: {}",
            temp_target_file.display(),
            err
        )
    })?;

    for (line_index, line) in source_lines.iter().enumerate() {
        if line_index >= truncate_from_line {
            break;
        }

        if line.trim().is_empty() {
            writeln!(target_handle).map_err(|err| err.to_string())?;
            continue;
        }

        let mut output_line = line.clone();
        if let Ok(mut value) = serde_json::from_str::<Value>(line) {
            collect_known_session_aliases(&value, &mut source_aliases);
            rewrite_codex_session_identifiers(&mut value, &source_aliases, target_session_id);
            output_line = serde_json::to_string(&value)
                .map_err(|err| format!("failed to serialize codex rewind entry: {}", err))?;
        }

        writeln!(target_handle, "{output_line}").map_err(|err| {
            format!(
                "failed to write codex rewind target {}: {}",
                temp_target_file.display(),
                err
            )
        })?;
    }

    target_handle.flush().map_err(|err| {
        format!(
            "failed to flush codex rewind target {}: {}",
            temp_target_file.display(),
            err
        )
    })?;

    if target_file.exists() {
        fs::remove_file(&target_file).map_err(|err| {
            format!(
                "failed to replace codex rewind target {}: {}",
                target_file.display(),
                err
            )
        })?;
    }
    fs::rename(&temp_target_file, &target_file).map_err(|err| {
        format!(
            "failed to finalize codex rewind target {}: {}",
            target_file.display(),
            err
        )
    })?;

    let mut deleted_count = 0usize;
    for path in source_files {
        fs::remove_file(&path).map_err(|err| {
            let _ = fs::remove_file(&target_file);
            format!(
                "failed to delete source codex session file {}: {}",
                path.display(),
                err
            )
        })?;
        deleted_count += 1;
    }

    Ok(CodexRewindCommitResult { deleted_count })
}

fn collect_optional_codex_session_files(
    session_id: &str,
    workspace_path: &Path,
    sessions_roots: &[PathBuf],
) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for root in sessions_roots {
        super::collect_jsonl_files(root, &mut files, &mut seen);
    }

    let mut matched_targets = Vec::new();
    for path in files {
        if !super::codex_session_file_matches_session_id(&path, session_id)? {
            continue;
        }
        if super::codex_session_file_matches_workspace(&path, workspace_path)? == Some(true) {
            matched_targets.push(path);
        }
    }
    Ok(matched_targets)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum CodexUserMessageEntryKind {
    EventMsg,
    ResponseItem,
}

struct CodexUserMessageMarker {
    kind: CodexUserMessageEntryKind,
    normalized_text: String,
    ids: Vec<String>,
}

#[derive(Clone)]
struct PreviousUserMessageMarker {
    line_index: usize,
    kind: CodexUserMessageEntryKind,
    normalized_text: String,
}

fn resolve_codex_rewind_boundary_line(
    source_lines: &[String],
    target_user_turn_index: usize,
    target_user_message_id: Option<&str>,
    local_user_message_count: Option<usize>,
    source_session_id: &str,
) -> Result<usize, String> {
    let normalized_target_id = target_user_message_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut turn_start_lines: Vec<usize> = Vec::new();
    let mut previous_user_marker: Option<PreviousUserMessageMarker> = None;
    let mut matched_line_by_message_id: Option<usize> = None;

    for (line_index, line) in source_lines.iter().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            previous_user_marker = None;
            continue;
        };
        let Some(marker) = extract_codex_user_message_marker(&value) else {
            previous_user_marker = None;
            continue;
        };

        let is_mirrored_pair = previous_user_marker
            .as_ref()
            .map(|previous| is_mirrored_user_message_pair(previous, &marker, line_index))
            .unwrap_or(false);
        let turn_start_line = if is_mirrored_pair {
            turn_start_lines.last().copied().unwrap_or(line_index)
        } else {
            turn_start_lines.push(line_index);
            line_index
        };

        if matched_line_by_message_id.is_none() {
            if let Some(target_id) = normalized_target_id {
                if marker.ids.iter().any(|candidate| candidate == target_id) {
                    matched_line_by_message_id = Some(turn_start_line);
                }
            }
        }

        previous_user_marker = Some(PreviousUserMessageMarker {
            line_index,
            kind: marker.kind,
            normalized_text: marker.normalized_text,
        });
    }

    if let Some(matched_line) = matched_line_by_message_id {
        return Ok(matched_line);
    }

    let source_user_turn_count = turn_start_lines.len();
    let mut resolved_target_index = target_user_turn_index;
    if let Some(local_user_message_count) = local_user_message_count.filter(|value| *value > 0) {
        if target_user_turn_index < local_user_message_count
            && source_user_turn_count > local_user_message_count
        {
            let remaining_turns = local_user_message_count.saturating_sub(target_user_turn_index);
            if remaining_turns > 0 && source_user_turn_count >= remaining_turns {
                resolved_target_index = source_user_turn_count - remaining_turns;
            }
        }
    }

    if let Some(line) = turn_start_lines.get(resolved_target_index).copied() {
        return Ok(line);
    }

    turn_start_lines
        .get(target_user_turn_index)
        .copied()
        .ok_or_else(|| {
            format!(
                "target user turn {} not found in codex session {}",
                target_user_turn_index + 1,
                source_session_id
            )
        })
}

fn is_mirrored_user_message_pair(
    previous: &PreviousUserMessageMarker,
    current: &CodexUserMessageMarker,
    current_line_index: usize,
) -> bool {
    let previous_text = previous.normalized_text.as_str();
    let current_text = current.normalized_text.as_str();
    let texts_match = previous_text == current_text
        || (previous_text.len() >= 8 && current_text.contains(previous_text))
        || (current_text.len() >= 8 && previous_text.contains(current_text));
    current_line_index == previous.line_index + 1
        && previous.kind != current.kind
        && !previous.normalized_text.is_empty()
        && !current.normalized_text.is_empty()
        && texts_match
}

fn extract_codex_user_message_marker(value: &Value) -> Option<CodexUserMessageMarker> {
    let entry_type = value.get("type").and_then(Value::as_str).unwrap_or("");
    let payload = value.get("payload").and_then(Value::as_object)?;
    let payload_type = payload.get("type").and_then(Value::as_str).unwrap_or("");

    if entry_type == "event_msg" && matches!(payload_type, "user_message" | "userMessage") {
        let text = extract_user_message_text_from_payload(payload);
        return Some(CodexUserMessageMarker {
            kind: CodexUserMessageEntryKind::EventMsg,
            normalized_text: normalize_user_message_text(text.as_str()),
            ids: extract_user_message_ids(value),
        });
    }

    let payload_role = payload.get("role").and_then(Value::as_str).unwrap_or("");
    if entry_type == "response_item"
        && payload_type == "message"
        && payload_role.eq_ignore_ascii_case("user")
    {
        let text = extract_user_message_text_from_payload(payload);
        return Some(CodexUserMessageMarker {
            kind: CodexUserMessageEntryKind::ResponseItem,
            normalized_text: normalize_user_message_text(text.as_str()),
            ids: extract_user_message_ids(value),
        });
    }

    None
}

fn extract_user_message_text_from_payload(payload: &serde_json::Map<String, Value>) -> String {
    for key in ["message", "text"] {
        let Some(value) = payload.get(key).and_then(Value::as_str) else {
            continue;
        };
        let normalized = value.trim();
        if !normalized.is_empty() {
            return normalized.to_string();
        }
    }

    let mut text_parts = Vec::new();
    let content_entries = payload
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for content_entry in content_entries {
        if let Some(text) = content_entry.as_str() {
            let normalized = text.trim();
            if !normalized.is_empty() {
                text_parts.push(normalized.to_string());
            }
            continue;
        }
        let Some(content_record) = content_entry.as_object() else {
            continue;
        };
        for key in ["text", "value", "content"] {
            let Some(text) = content_record.get(key).and_then(Value::as_str) else {
                continue;
            };
            let normalized = text.trim();
            if !normalized.is_empty() {
                text_parts.push(normalized.to_string());
            }
            break;
        }
    }
    text_parts.join("\n\n")
}

fn normalize_user_message_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_user_message_ids(value: &Value) -> Vec<String> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    let payload = value.get("payload").and_then(Value::as_object);

    let mut candidates: Vec<Option<&Value>> = vec![
        value.get("id"),
        payload.and_then(|record| record.get("id")),
        payload.and_then(|record| record.get("message_id")),
        payload.and_then(|record| record.get("messageId")),
        payload.and_then(|record| record.get("user_message_id")),
        payload.and_then(|record| record.get("userMessageId")),
        payload.and_then(|record| record.get("item_id")),
        payload.and_then(|record| record.get("itemId")),
    ];
    if let Some(payload) = payload {
        if let Some(item) = payload.get("item").and_then(Value::as_object) {
            candidates.push(item.get("id"));
            candidates.push(item.get("message_id"));
            candidates.push(item.get("messageId"));
        }
    }

    for candidate in candidates {
        let Some(candidate) = candidate.and_then(Value::as_str) else {
            continue;
        };
        let normalized = candidate.trim();
        if normalized.is_empty() || seen.contains(normalized) {
            continue;
        }
        seen.insert(normalized.to_string());
        ids.push(normalized.to_string());
    }

    ids
}

fn collect_known_session_aliases(value: &Value, aliases: &mut HashSet<String>) {
    let Some(entry_type) = value.get("type").and_then(Value::as_str) else {
        return;
    };
    if entry_type != "session_meta" && entry_type != "turn_context" {
        return;
    }
    let Some(payload) = value.get("payload").and_then(Value::as_object) else {
        return;
    };
    for candidate in [
        payload.get("id"),
        payload.get("sessionId"),
        payload.get("session_id"),
        payload
            .get("sessionMeta")
            .and_then(Value::as_object)
            .and_then(|session_meta| session_meta.get("id")),
        payload
            .get("session_meta")
            .and_then(Value::as_object)
            .and_then(|session_meta| session_meta.get("id")),
    ] {
        let Some(candidate) = candidate.and_then(Value::as_str) else {
            continue;
        };
        let normalized = candidate.trim();
        if !normalized.is_empty() {
            aliases.insert(normalized.to_string());
        }
    }
}

fn rewrite_codex_session_identifiers(
    value: &mut Value,
    source_aliases: &HashSet<String>,
    target_session_id: &str,
) {
    match value {
        Value::Object(map) => {
            let entry_type = map
                .get("type")
                .and_then(Value::as_str)
                .map(ToString::to_string);
            if matches!(entry_type.as_deref(), Some("session_meta" | "turn_context")) {
                rewrite_session_payload_identifiers(map, source_aliases, target_session_id);
            }
            for (key, nested) in map.iter_mut() {
                if should_rewrite_session_identifier(
                    entry_type.as_deref(),
                    key.as_str(),
                    nested,
                    source_aliases,
                ) {
                    *nested = Value::String(target_session_id.to_string());
                    continue;
                }
                rewrite_codex_session_identifiers(nested, source_aliases, target_session_id);
            }
        }
        Value::Array(items) => {
            for item in items {
                rewrite_codex_session_identifiers(item, source_aliases, target_session_id);
            }
        }
        _ => {}
    }
}

fn rewrite_session_payload_identifiers(
    map: &mut serde_json::Map<String, Value>,
    source_aliases: &HashSet<String>,
    target_session_id: &str,
) {
    let Some(payload) = map.get_mut("payload").and_then(Value::as_object_mut) else {
        return;
    };

    rewrite_matching_string_field(payload, "id", source_aliases, target_session_id);
    rewrite_matching_string_field(payload, "sessionId", source_aliases, target_session_id);
    rewrite_matching_string_field(payload, "session_id", source_aliases, target_session_id);

    for nested_key in ["sessionMeta", "session_meta"] {
        let Some(nested) = payload.get_mut(nested_key).and_then(Value::as_object_mut) else {
            continue;
        };
        rewrite_matching_string_field(nested, "id", source_aliases, target_session_id);
        rewrite_matching_string_field(nested, "sessionId", source_aliases, target_session_id);
        rewrite_matching_string_field(nested, "session_id", source_aliases, target_session_id);
    }
}

fn rewrite_matching_string_field(
    map: &mut serde_json::Map<String, Value>,
    key: &str,
    source_aliases: &HashSet<String>,
    target_session_id: &str,
) {
    let Some(candidate) = map.get(key).and_then(Value::as_str) else {
        return;
    };
    let normalized = candidate.trim();
    if normalized.is_empty() || !source_aliases.contains(normalized) {
        return;
    }
    map.insert(
        key.to_string(),
        Value::String(target_session_id.to_string()),
    );
}

fn should_rewrite_session_identifier(
    entry_type: Option<&str>,
    key: &str,
    value: &Value,
    source_aliases: &HashSet<String>,
) -> bool {
    let Some(candidate) = value.as_str() else {
        return false;
    };
    let normalized = candidate.trim();
    if normalized.is_empty() || !source_aliases.contains(normalized) {
        return false;
    }
    matches!(key, "session_id" | "sessionId")
        || matches!(entry_type, Some("session_meta" | "turn_context")) && key == "id"
}
