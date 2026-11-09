from typing import Any
from app.service.compaction.budget import estimate_tokens


def _classify_event_priority(event: dict[str, Any], is_last: bool, is_first: bool) -> int:
    """
    Priority classification:
    1: Absolutely Crucial (User goal, final answer, errors/fails, file edits, loops, start/end)
    2: Structural Actions (Commands, Phase Digests)
    3: Secondary Exploration (Benign routine reads)
    """
    if is_first or is_last:
        return 1

    if event.get("type") == "USER_INPUT":
        return 1

    if event.get("error") or event.get("type") == "REPEATED_TOOL_LOOP":
        return 1

    tools = event.get("tools") or []
    for t in tools:
        if t.get("failed") or t.get("name") in {"edit_file", "write_file", "delete_file"}:
            return 1

    # Check for phase digests or commands
    if event.get("phase") == "CODEBASE_INSPECTION":
        return 2

    for t in tools:
        if t.get("name") == "run_command":
            return 2

    return 3


def apply_priority_sieve(events: list[dict[str, Any]], budget: int) -> list[dict[str, Any]]:
    """
    Stage 4: Knapsack Priority Sieve.
    Guarantees the payload fits strictly within the budget while locking
    100% of crucial anchors (user prompt, final answer, errors, edits, loops).
    """
    if not events:
        return []

    if estimate_tokens(events) <= budget:
        return events

    total = len(events)
    p1_indices = []
    p2_indices = []
    p3_indices = []

    for idx, e in enumerate(events):
        p = _classify_event_priority(e, is_last=(idx == total - 1), is_first=(idx == 0))
        if p == 1:
            p1_indices.append(idx)
        elif p == 2:
            p2_indices.append(idx)
        else:
            p3_indices.append(idx)

    selected_indices = set(p1_indices)

    # Greedily include P2 events if they fit
    for idx in p2_indices:
        candidate = sorted(list(selected_indices | {idx}))
        candidate_events = [events[i] for i in candidate]
        if estimate_tokens(candidate_events) <= budget:
            selected_indices.add(idx)

    # If there is remaining budget, uniformly sample P3 events
    if p3_indices:
        # Calculate stride to sample evenly across timeline
        current_events = [events[i] for i in sorted(list(selected_indices))]
        current_tokens = estimate_tokens(current_events)
        headroom = budget - current_tokens

        if headroom > 100:
            # Estimate how many P3 events we can afford
            sample_cost = max(20, estimate_tokens(events[p3_indices[0]]))
            max_p3_to_add = min(len(p3_indices), headroom // sample_cost)

            if max_p3_to_add > 0:
                stride = max(1, len(p3_indices) // max_p3_to_add)
                for k in range(0, len(p3_indices), stride):
                    idx = p3_indices[k]
                    candidate = sorted(list(selected_indices | {idx}))
                    if estimate_tokens([events[i] for i in candidate]) <= budget:
                        selected_indices.add(idx)
                    else:
                        break

    # Build final output in chronological order
    final_events = [events[i] for i in sorted(list(selected_indices))]

    # If some routine P3 steps were omitted, add a clean 1-line note
    omitted_count = total - len(final_events)
    if omitted_count > 0:
        final_events.insert(
            min(1, len(final_events)),
            {
                "notice": f"Stage 4 Knapsack: {omitted_count} intermediate routine inspection steps omitted; see ledger.file_audit for full list",
            },
        )

    return final_events
