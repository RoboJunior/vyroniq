from typing import Any
import json


def _distill_error(err_str: str) -> str:
    """
    Distill 50-line python stacktraces into exception header + root cause line.
    """
    if len(err_str) <= 250:
        return err_str

    lines = [line.strip() for line in err_str.strip().splitlines() if line.strip()]
    if len(lines) <= 3:
        return err_str[:250] + "..."

    first_line = lines[0]
    last_line = lines[-1]
    return f"{first_line} ... [omitted internal trace] ... {last_line}"


def _get_single_tool_signature(event: dict[str, Any]) -> str | None:
    tools = event.get("tools") or []
    if len(tools) == 1:
        t = tools[0]
        name = t.get("name", "")
        args = json.dumps(t.get("args") or {}, sort_keys=True)
        return f"{name}::{args}"
    return None


def apply_rle_and_distillation(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Stage 2: Deterministic Run-Length Encoding of repeated tool invocations,
    stacktrace distillation, and intermediate thought truncation.
    """
    if not events:
        return []

    # 1. Distill errors and truncate intermediate chatter (preserving the last event)
    processed = []
    total = len(events)
    for idx, e in enumerate(events):
        item = dict(e)
        is_last = (idx == total - 1)

        # Distill error if present
        if item.get("error"):
            item["error"] = _distill_error(str(item["error"]))

        # Truncate intermediate content (never truncate user request or final delivery)
        content = item.get("content")
        if content and isinstance(content, str) and not is_last and item.get("type") != "USER_INPUT":
            if len(content) > 300:
                item["content"] = content[:150] + " ... [omitted thoughts] ... " + content[-120:]

        processed.append(item)

    # 2. Run-Length Encode consecutive single-tool invocations
    compressed = []
    i = 0
    while i < len(processed):
        curr = processed[i]
        curr_sig = _get_single_tool_signature(curr)

        # Only group if it has a single tool, no errors, and no long custom content
        if curr_sig and not curr.get("error") and not curr.get("content") and curr.get("type") != "USER_INPUT":
            j = i + 1
            while j < len(processed):
                next_item = processed[j]
                next_sig = _get_single_tool_signature(next_item)
                if next_sig == curr_sig and not next_item.get("error") and not next_item.get("content"):
                    j += 1
                else:
                    break

            repeat_count = j - i
            if repeat_count >= 3:
                tool_info = curr["tools"][0]
                compressed.append({
                    "step_range": [curr.get("step"), processed[j - 1].get("step")],
                    "type": "REPEATED_TOOL_LOOP",
                    "tool": tool_info.get("name"),
                    "args": tool_info.get("args"),
                    "repeat_count": repeat_count,
                    "status": "COMPLETED",
                })
                i = j
                continue

        compressed.append(curr)
        i += 1

    return compressed
