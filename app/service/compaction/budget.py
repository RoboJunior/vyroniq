import json
from typing import Any


def estimate_tokens(data: Any) -> int:
    """
    Sub-millisecond token estimation calibrated for structured JSON:
    Whitespace, punctuation, and code tokenization in JSON averages ~3.1 - 3.2 chars/token.
    """
    if data is None:
        return 0
    if isinstance(data, str):
        return max(1, len(data) // 3 + 1)
    try:
        json_str = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        return max(1, len(json_str) // 3 + 1)
    except Exception:
        return max(1, len(str(data)) // 3 + 1)


def calculate_event_budget(
    context_window: int = 8192,
    goal: str = "",
    ledger: dict | None = None,
    output_reserve: int = 1024,
    safety_margin_pct: float = 0.10,
) -> int:
    """
    Calculate the exact remaining token budget for interaction events.
    Budget = ContextWindow - QuestionsTokens - GoalTokens - LedgerTokens - OutputReserve - SafetyMargin
    """
    questions_tokens = 650  # 7 SystemOne evaluation question definitions
    goal_tokens = estimate_tokens(goal)
    ledger_tokens = estimate_tokens(ledger) if ledger else 350
    safety_margin = max(500, int(context_window * safety_margin_pct))

    overhead = (
        questions_tokens
        + goal_tokens
        + ledger_tokens
        + output_reserve
        + safety_margin
    )
    # Ensure there is always a viable non-negative budget
    remaining = context_window - overhead
    return max(800, remaining)
