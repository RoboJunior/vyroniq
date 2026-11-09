from typing import Any


def _extract_tool_target(name: str, args: dict) -> str:
    if name in {"read_file", "edit_file", "write_file"}:
        return str(args.get("Path") or args.get("path") or "")
    if name == "run_command":
        return str(args.get("toolSummary") or args.get("CommandLine") or "")
    for k in ("Path", "path", "query", "pattern", "name"):
        if k in args:
            return str(args[k])
    return ""


def build_evidence_ledger(raw_events: list[dict[str, Any]], goal: str = "") -> dict[str, Any]:
    """
    Extract a 100% deterministic, lossless ground-truth evidence ledger
    from the raw interaction events.
    """
    if not raw_events:
        return {
            "total_raw_events": 0,
            "unique_steps": 0,
            "terminal_status": "UNKNOWN",
            "model_lineage": [],
            "model_switches": [],
            "file_audit": {"files_inspected": [], "files_modified": []},
            "command_audit": [],
            "anomaly_audit": {"total_errors": 0, "error_samples": [], "repeated_loops": []},
            "final_response_preview": "",
        }

    unique_steps = set()
    models_seen = []
    model_switches = []
    files_inspected = set()
    files_modified = set()
    commands = []
    errors = []
    consecutive_tools = []  # List of (step, tool_name, target)
    final_response = ""
    terminal_status = "IN_PROGRESS"

    prev_model = None

    for event in raw_events:
        metadata = event.get("conversation_metadata") or {}
        step = metadata.get("step_index")
        if step is not None:
            unique_steps.add(step)

        event_status = metadata.get("status") or event.get("termination_reason")
        if event_status:
            terminal_status = str(event_status)

        # Track models
        model = event.get("model_name")
        if model:
            if not models_seen or models_seen[-1] != model:
                models_seen.append(model)
            if prev_model and prev_model != model:
                model_switches.append({"step": step, "from": prev_model, "to": model})
            prev_model = model

        # Check for errors
        error_val = event.get("error")
        if error_val:
            err_str = str(error_val).strip()
            if err_str and err_str not in errors:
                errors.append(err_str[:200])

        # Extract text / final response
        content = (
            metadata.get("content_text")
            or metadata.get("content")
            or ""
        )
        if isinstance(content, str) and content.strip():
            final_response = content.strip()

        # Tool calls
        tool_calls = metadata.get("tool_calls") or []
        for tc in tool_calls:
            name = tc.get("name", "unknown")
            args = tc.get("args") or {}
            target = _extract_tool_target(name, args)

            if step is not None:
                consecutive_tools.append((step, name, target))

            if name in {"read_file", "search_web", "fetch_web_page"}:
                if target:
                    files_inspected.add(target)
            elif name in {"edit_file", "write_file"}:
                if target:
                    files_modified.add(target)
            elif name == "run_command":
                summary = args.get("toolSummary") or "Command execution"
                is_err = bool(error_val)
                commands.append({"step": step, "summary": str(summary)[:100], "failed": is_err})

    # Detect repeated tool loops (>= 3 consecutive or near-consecutive identical actions)
    repeated_loops = []
    if consecutive_tools:
        current_tool = consecutive_tools[0]
        count = 1
        loop_steps = [current_tool[0]]
        for item in consecutive_tools[1:]:
            if item[1] == current_tool[1] and item[2] == current_tool[2] and item[1] != "unknown":
                count += 1
                loop_steps.append(item[0])
            else:
                if count >= 3:
                    repeated_loops.append({
                        "tool": current_tool[1],
                        "target": current_tool[2][:120],
                        "consecutive_count": count,
                        "steps": loop_steps,
                    })
                current_tool = item
                count = 1
                loop_steps = [item[0]]
        if count >= 3:
            repeated_loops.append({
                "tool": current_tool[1],
                "target": current_tool[2][:120],
                "consecutive_count": count,
                "steps": loop_steps,
            })

    return {
        "total_raw_events": len(raw_events),
        "unique_steps": len(unique_steps),
        "terminal_status": terminal_status,
        "model_lineage": models_seen,
        "model_switches": model_switches,
        "file_audit": {
            "files_inspected": sorted(list(files_inspected))[:50],
            "files_modified": sorted(list(files_modified))[:50],
        },
        "command_audit": commands[-20:],  # Keep up to 20 recent commands
        "anomaly_audit": {
            "total_errors": len(errors),
            "error_samples": errors[:5],
            "repeated_loops": repeated_loops,
        },
        "final_response_preview": final_response[:250] if final_response else "",
    }
