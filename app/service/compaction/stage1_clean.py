from typing import Any


def clean_tool_call(tool: dict[str, Any], has_error: bool = False) -> dict[str, Any]:
    name = tool.get("name", "unknown")
    args = tool.get("args") or {}

    clean_args = {}
    if name == "read_file":
        for k in ("Path", "path", "StartLine", "EndLine"):
            if k in args:
                clean_args[k] = args[k]
    elif name == "edit_file":
        clean_args = {
            "Path": args.get("Path") or args.get("path"),
            "action": "edit",
        }
    elif name == "write_file":
        clean_args = {
            "Path": args.get("Path") or args.get("path"),
            "action": "write",
        }
    elif name == "run_command":
        clean_args = {
            "summary": args.get("toolSummary") or "Command execution",
        }
        if args.get("CommandLine"):
            cmd = str(args.get("CommandLine"))
            clean_args["cmd"] = cmd[:120]
    else:
        for k, v in args.items():
            if isinstance(v, (str, int, float, bool)) and len(str(v)) < 150:
                if k.lower() not in {
                    "content",
                    "code",
                    "replacement",
                    "target",
                    "output",
                    "result",
                    "stdout",
                    "stderr",
                    "artifactmetadata",
                }:
                    clean_args[k] = v

    out = {"name": name, "args": clean_args}
    if has_error:
        out["failed"] = True
    return out


def deduplicate_and_clean(raw_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Stage 1: Deduplicate multiple raw records per step_index and strip
    nulls and redundant telemetry noise.
    """
    if not raw_events:
        return []

    # Map step_index -> consolidated event data
    step_map: dict[int | str, dict[str, Any]] = {}
    ordered_keys = []

    for idx, event in enumerate(raw_events):
        metadata = event.get("conversation_metadata") or {}
        step = metadata.get("step_index")
        key = step if step is not None else f"unindexed_{idx}"

        if key not in step_map:
            step_map[key] = {
                "step": step,
                "type": metadata.get("type"),
                "status": metadata.get("status") or event.get("termination_reason"),
                "content": None,
                "error": None,
                "tools": [],
                "model": event.get("model_name"),
            }
            ordered_keys.append(key)

        entry = step_map[key]

        # Upgrade status if a more definitive one is found
        curr_status = metadata.get("status") or event.get("termination_reason")
        if curr_status:
            if entry["status"] in (None, "IN_PROGRESS", "UNKNOWN") or curr_status in ("COMPLETED", "DONE"):
                entry["status"] = curr_status

        # Reconcile text
        content = (
            metadata.get("content_text")
            or metadata.get("content")
        )
        if isinstance(content, dict):
            req = content.get("user_request")
            if req:
                entry["content"] = str(req).strip()
        elif isinstance(content, str) and content.strip():
            entry["content"] = content.strip()

        # Capture error
        if event.get("error"):
            entry["error"] = str(event["error"]).strip()

        # Combine tools
        tool_calls = metadata.get("tool_calls") or []
        for tc in tool_calls:
            cleaned = clean_tool_call(tc, has_error=bool(event.get("error")))
            # Avoid duplicate tool calls within the same step
            if cleaned not in entry["tools"]:
                entry["tools"].append(cleaned)

    # Build clean output array
    cleaned_events = []
    for key in ordered_keys:
        e = step_map[key]
        clean_e = {"step": e["step"]}
        if e.get("type"):
            clean_e["type"] = e["type"]
        if e.get("status") and e["status"] not in ("UNKNOWN",):
            clean_e["status"] = e["status"]
        if e.get("content"):
            clean_e["content"] = e["content"]
        if e.get("tools"):
            clean_e["tools"] = e["tools"]
        if e.get("error"):
            clean_e["error"] = e["error"]
        cleaned_events.append(clean_e)

    return cleaned_events
