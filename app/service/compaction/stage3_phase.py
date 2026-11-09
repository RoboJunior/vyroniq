from typing import Any


def _is_pure_read_step(event: dict[str, Any]) -> bool:
    """
    Check if an event is a benign, read-only inspection step with no errors,
    no content thoughts, and no mutations.
    """
    if event.get("error") or event.get("type") == "USER_INPUT":
        return False
    # If it has meaningful content text, don't collapse blindly
    if event.get("content"):
        return False

    tools = event.get("tools") or []
    if not tools:
        return False

    for t in tools:
        name = t.get("name", "")
        # Mutating tools or failures can never be pure read steps
        if name in {"edit_file", "write_file", "delete_file"} or t.get("failed"):
            return False
        # Commands might mutate state; only consider standard read/search tools
        if name not in {"read_file", "search_web", "fetch_web_page", "list_dir", "grep_search", "file_search"}:
            return False

    return True


def _extract_target_paths(event: dict[str, Any]) -> list[str]:
    paths = []
    for t in event.get("tools") or []:
        args = t.get("args") or {}
        p = args.get("Path") or args.get("path") or args.get("query")
        if p:
            paths.append(str(p))
    return paths


def aggregate_inspection_phases(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Stage 3: State-machine phase aggregator. Collapses contiguous bursts
    of >= 4 benign, read-only inspection steps into concise Phase Digests.
    """
    if not events:
        return []

    output = []
    total = len(events)
    i = 0

    while i < total:
        # Never collapse the first 2 steps or the last step
        if i < 2 or i >= total - 1 or not _is_pure_read_step(events[i]):
            output.append(events[i])
            i += 1
            continue

        # Look ahead to see how many contiguous pure read steps exist
        j = i
        inspected_paths = set()
        while j < total - 1 and _is_pure_read_step(events[j]):
            for p in _extract_target_paths(events[j]):
                inspected_paths.add(p)
            j += 1

        burst_len = j - i
        if burst_len >= 4:
            start_step = events[i].get("step")
            end_step = events[j - 1].get("step")
            output.append({
                "phase": "CODEBASE_INSPECTION",
                "step_range": [start_step, end_step],
                "step_count": burst_len,
                "files_inspected": sorted(list(inspected_paths))[:20],
                "outcome": "ALL_READS_SUCCESSFUL",
            })
            i = j
        else:
            # Not long enough to warrant a phase digest
            output.append(events[i])
            i += 1

    return output
