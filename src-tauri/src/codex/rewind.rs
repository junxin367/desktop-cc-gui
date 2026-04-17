use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;
use crate::local_usage;
use crate::shared::codex_core;
use crate::types::WorkspaceEntry;

#[derive(Clone, Debug)]
struct UserMessageCandidate {
    id: String,
    text: String,
}

fn extract_thread_id(value: &Value) -> Option<String> {
    value
        .get("result")
        .and_then(|result| result.get("threadId"))
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("thread"))
                .and_then(|thread| thread.get("id"))
        })
        .or_else(|| value.get("threadId"))
        .or_else(|| value.get("thread").and_then(|thread| thread.get("id")))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn normalize_comparable_message_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_user_message_text(item: &Value) -> String {
    for direct_key in ["text", "message"] {
        let Some(direct_text) = item.get(direct_key).and_then(Value::as_str) else {
            continue;
        };
        let normalized = direct_text.trim();
        if !normalized.is_empty() {
            return normalized.to_string();
        }
    }

    let mut content_parts = Vec::new();
    let content_entries = item
        .get("content")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for entry in content_entries {
        if let Some(text) = entry.as_str() {
            let normalized = text.trim();
            if !normalized.is_empty() {
                content_parts.push(normalized.to_string());
            }
            continue;
        }
        let Some(record) = entry.as_object() else {
            continue;
        };
        for key in ["text", "value", "content"] {
            let Some(text) = record.get(key).and_then(Value::as_str) else {
                continue;
            };
            let normalized = text.trim();
            if !normalized.is_empty() {
                content_parts.push(normalized.to_string());
            }
            break;
        }
    }
    content_parts.join("\n\n")
}

fn collect_user_messages_from_thread(value: &Value) -> Vec<UserMessageCandidate> {
    let mut user_messages = Vec::new();
    let turns = value
        .get("result")
        .and_then(|result| result.get("thread"))
        .and_then(|thread| thread.get("turns"))
        .or_else(|| value.get("thread").and_then(|thread| thread.get("turns")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for turn in turns {
        let items = turn
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for item in items {
            let item_type = item.get("type").and_then(Value::as_str).unwrap_or("");
            let item_role = item.get("role").and_then(Value::as_str).unwrap_or("");
            let is_user = matches!(item_type, "userMessage" | "user_message")
                || item_role.eq_ignore_ascii_case("user");
            if !is_user {
                continue;
            }
            let Some(id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let normalized = id.trim();
            if !normalized.is_empty() {
                user_messages.push(UserMessageCandidate {
                    id: normalized.to_string(),
                    text: extract_user_message_text(&item),
                });
            }
        }
    }

    user_messages
}

fn resolve_target_message_id(
    user_messages: &[UserMessageCandidate],
    requested_message_id: Option<&str>,
    target_user_turn_index: usize,
    target_user_message_text: Option<&str>,
    target_user_message_occurrence: Option<usize>,
    local_user_message_count: Option<usize>,
    thread_id: &str,
) -> Result<String, String> {
    if let Some(requested_message_id) = requested_message_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if user_messages
            .iter()
            .any(|candidate| candidate.id == requested_message_id)
        {
            return Ok(requested_message_id.to_string());
        }
    }

    if let Some(target_user_message_text) = target_user_message_text
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let normalized_target_text = normalize_comparable_message_text(target_user_message_text);
        if !normalized_target_text.is_empty() {
            let target_occurrence = target_user_message_occurrence.unwrap_or(1).max(1);
            let mut matched_occurrence = 0usize;
            for candidate in user_messages {
                let normalized_candidate_text =
                    normalize_comparable_message_text(candidate.text.as_str());
                if normalized_candidate_text != normalized_target_text {
                    continue;
                }
                matched_occurrence += 1;
                if matched_occurrence == target_occurrence {
                    return Ok(candidate.id.clone());
                }
            }
        }
    }

    if let Some(local_user_message_count) = local_user_message_count.filter(|value| *value > 0) {
        let runtime_user_message_count = user_messages.len();
        let should_tail_align = runtime_user_message_count > local_user_message_count;
        if should_tail_align && target_user_turn_index < local_user_message_count {
            let remaining_turns = local_user_message_count.saturating_sub(target_user_turn_index);
            if remaining_turns > 0 && runtime_user_message_count >= remaining_turns {
                let aligned_index = runtime_user_message_count - remaining_turns;
                if let Some(candidate) = user_messages.get(aligned_index) {
                    return Ok(candidate.id.clone());
                }
            }
        }
    }

    user_messages
        .get(target_user_turn_index)
        .map(|candidate| candidate.id.clone())
        .ok_or_else(|| {
            format!(
                "target user message ordinal {} not found for codex session {}",
                target_user_turn_index + 1,
                thread_id
            )
        })
}

fn finalize_rewind_success(
    child_thread_id: String,
    resolved_message_id: String,
    deleted_count: usize,
    archive_result: Result<Value, String>,
) -> Result<Value, String> {
    archive_result.map_err(|error| {
        format!(
            "codex rewind committed hard truncation but failed to archive source runtime thread: {error}"
        )
    })?;

    Ok(json!({
        "thread": {
            "id": child_thread_id
        },
        "resolvedMessageId": resolved_message_id,
        "truncated": true,
        "deletedCount": deleted_count,
        "archivedBeforeDelete": true
    }))
}

#[cfg(test)]
mod tests {
    use super::{finalize_rewind_success, resolve_target_message_id, UserMessageCandidate};
    use serde_json::json;

    fn user_message(id: &str, text: &str) -> UserMessageCandidate {
        UserMessageCandidate {
            id: id.to_string(),
            text: text.to_string(),
        }
    }

    #[test]
    fn resolve_target_message_id_keeps_index_fallback_without_local_count_hint() {
        let runtime_user_messages = vec![
            user_message("u1", "first"),
            user_message("u2", "second"),
            user_message("u3", "third"),
        ];

        let resolved = resolve_target_message_id(
            &runtime_user_messages,
            Some("missing-local-id"),
            1,
            None,
            None,
            None,
            "thread-1",
        )
        .expect("index fallback should resolve");

        assert_eq!(resolved, "u2");
    }

    #[test]
    fn resolve_target_message_id_uses_tail_alignment_when_runtime_has_more_messages() {
        let runtime_user_messages = vec![
            user_message("u1", "first"),
            user_message("u2", "second"),
            user_message("u3", "third"),
        ];

        let resolved = resolve_target_message_id(
            &runtime_user_messages,
            Some("missing-local-id"),
            1,
            None,
            None,
            Some(2),
            "thread-1",
        )
        .expect("tail-aligned fallback should resolve");

        assert_eq!(resolved, "u3");
    }

    #[test]
    fn resolve_target_message_id_does_not_tail_align_when_runtime_has_fewer_messages() {
        let runtime_user_messages = vec![user_message("u1", "first"), user_message("u2", "second")];

        let resolved = resolve_target_message_id(
            &runtime_user_messages,
            Some("missing-local-id"),
            1,
            None,
            None,
            Some(3),
            "thread-1",
        )
        .expect("index fallback should keep selected turn");

        assert_eq!(resolved, "u2");
    }

    #[test]
    fn finalize_rewind_success_rejects_source_runtime_archive_failure() {
        let error = finalize_rewind_success(
            "thread-child".to_string(),
            "message-1".to_string(),
            1,
            Err("archive failed".to_string()),
        )
        .expect_err("archive failure should reject rewind success");

        assert!(error.contains("failed to archive source runtime thread"));
        assert!(error.contains("archive failed"));
    }

    #[test]
    fn finalize_rewind_success_returns_truncated_payload_after_archive() {
        let payload = finalize_rewind_success(
            "thread-child".to_string(),
            "message-1".to_string(),
            2,
            Ok(json!({ "archived": true })),
        )
        .expect("archive success should keep rewind success payload");

        assert_eq!(payload["thread"]["id"], "thread-child");
        assert_eq!(payload["resolvedMessageId"], "message-1");
        assert_eq!(payload["truncated"], true);
        assert_eq!(payload["deletedCount"], 2);
        assert_eq!(payload["archivedBeforeDelete"], true);
    }
}

pub(crate) async fn rewind_thread_from_message(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    thread_id: String,
    message_id: Option<String>,
    target_user_turn_index: u32,
    target_user_message_text: Option<String>,
    target_user_message_occurrence: Option<u32>,
    local_user_message_count: Option<u32>,
) -> Result<Value, String> {
    let normalized_thread_id = thread_id.trim().to_string();
    if normalized_thread_id.is_empty() {
        return Err("thread_id is required".to_string());
    }
    let target_user_turn_index = target_user_turn_index as usize;
    if target_user_turn_index == 0 {
        return Err("target_user_turn_index must be >= 1 for codex rewind".to_string());
    }

    let resume_response = codex_core::resume_thread_core(
        sessions,
        workspace_id.clone(),
        normalized_thread_id.clone(),
    )
    .await?;
    let user_messages = collect_user_messages_from_thread(&resume_response);
    let resolved_message_id = resolve_target_message_id(
        &user_messages,
        message_id.as_deref(),
        target_user_turn_index,
        target_user_message_text.as_deref(),
        target_user_message_occurrence
            .map(|value| value as usize)
            .filter(|value| *value > 0),
        local_user_message_count
            .map(|value| value as usize)
            .filter(|value| *value > 0),
        normalized_thread_id.as_str(),
    )?;

    let fork_response = codex_core::fork_thread_core(
        sessions,
        workspace_id.clone(),
        normalized_thread_id.clone(),
        Some(resolved_message_id.clone()),
    )
    .await?;
    let child_thread_id = extract_thread_id(&fork_response)
        .ok_or_else(|| "codex rewind fork did not return a child thread id".to_string())?;
    if child_thread_id.trim().is_empty() {
        return Err("codex rewind fork returned an empty child thread id".to_string());
    }

    let commit_result = match local_usage::commit_codex_rewind_for_workspace(
        workspaces,
        workspace_id.as_str(),
        normalized_thread_id.as_str(),
        child_thread_id.as_str(),
        target_user_turn_index,
        Some(resolved_message_id.clone()),
        local_user_message_count
            .map(|value| value as usize)
            .filter(|value| *value > 0),
    )
    .await
    {
        Ok(result) => result,
        Err(error) => {
            let _ = codex_core::archive_thread_core(
                sessions,
                workspace_id.clone(),
                child_thread_id.clone(),
            )
            .await;
            return Err(error);
        }
    };

    let archive_result = codex_core::archive_thread_core(
        sessions,
        workspace_id.clone(),
        normalized_thread_id.clone(),
    )
    .await;

    finalize_rewind_success(
        child_thread_id,
        resolved_message_id,
        commit_result.deleted_count,
        archive_result,
    )
}
