import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.service.compaction.budget import estimate_tokens, calculate_event_budget
from app.service.compaction.ledger import build_evidence_ledger
from app.service.compaction.stage1_clean import deduplicate_and_clean
from app.service.compaction.stage2_rle import apply_rle_and_distillation
from app.service.compaction.stage3_phase import aggregate_inspection_phases
from app.service.compaction.stage4_sieve import apply_priority_sieve
from app.service.compaction.pipeline import compact_interaction_for_systemone


def test_token_estimation():
    assert estimate_tokens(None) == 0
    assert estimate_tokens("") == 1
    sample = {"key": "value", "numbers": [1, 2, 3]}
    tokens = estimate_tokens(sample)
    assert tokens > 0
    assert tokens < 100
    print("PASS: test_token_estimation")


def test_budget_calculation():
    budget = calculate_event_budget(context_window=8192, goal="Fix bug in service", ledger={"total": 10})
    assert budget >= 800
    assert budget < 8192
    print("PASS: test_budget_calculation")


def test_evidence_ledger_extraction():
    raw_events = [
        {
            "conversation_id": "test-convo",
            "model_name": "gemini-flash",
            "conversation_metadata": {
                "step_index": 0,
                "type": "USER_INPUT",
                "content_text": "Refactor elasticsearch service",
            },
        },
        # 4 consecutive reads of the same file
        *[
            {
                "conversation_id": "test-convo",
                "model_name": "gemini-flash",
                "conversation_metadata": {
                    "step_index": i,
                    "type": "PLANNER_RESPONSE",
                    "tool_calls": [
                        {"name": "read_file", "args": {"Path": "app/service/es.py"}}
                    ],
                },
            }
            for i in range(1, 5)
        ],
        # File edit
        {
            "conversation_id": "test-convo",
            "model_name": "gemini-flash",
            "conversation_metadata": {
                "step_index": 5,
                "type": "PLANNER_RESPONSE",
                "tool_calls": [
                    {"name": "edit_file", "args": {"Path": "app/service/es.py"}}
                ],
            },
        },
        # Failed command
        {
            "conversation_id": "test-convo",
            "error": "Traceback: Command failed with exit code 1",
            "conversation_metadata": {
                "step_index": 6,
                "type": "PLANNER_RESPONSE",
                "tool_calls": [
                    {"name": "run_command", "args": {"toolSummary": "Run pytest"}}
                ],
            },
        },
        # Final answer
        {
            "conversation_id": "test-convo",
            "conversation_metadata": {
                "step_index": 7,
                "type": "PLANNER_RESPONSE",
                "status": "COMPLETED",
                "content_text": "Refactoring is complete and verified.",
            },
        },
    ]

    ledger = build_evidence_ledger(raw_events, goal="Refactor elasticsearch service")
    assert ledger["unique_steps"] == 8
    assert "app/service/es.py" in ledger["file_audit"]["files_inspected"]
    assert "app/service/es.py" in ledger["file_audit"]["files_modified"]
    assert ledger["anomaly_audit"]["total_errors"] == 1
    assert len(ledger["anomaly_audit"]["repeated_loops"]) == 1
    assert ledger["anomaly_audit"]["repeated_loops"][0]["consecutive_count"] == 4
    assert ledger["terminal_status"] == "COMPLETED"
    print("PASS: test_evidence_ledger_extraction")


def test_stage1_deduplication():
    raw_events = [
        {
            "conversation_metadata": {
                "step_index": 2,
                "type": "PLANNER_RESPONSE",
                "status": "IN_PROGRESS",
                "tool_calls": [{"name": "read_file", "args": {"Path": "config.py"}}],
            }
        },
        {
            "conversation_metadata": {
                "step_index": 2,
                "type": "PLANNER_RESPONSE",
                "status": "COMPLETED",
                "content_text": "Finished reading config file.",
            }
        },
    ]

    clean = deduplicate_and_clean(raw_events)
    assert len(clean) == 1
    assert clean[0]["step"] == 2
    assert clean[0]["status"] == "COMPLETED"
    assert clean[0]["content"] == "Finished reading config file."
    assert len(clean[0]["tools"]) == 1
    print("PASS: test_stage1_deduplication")


def test_stage2_rle_and_distillation():
    events = [
        {"step": i, "tools": [{"name": "read_file", "args": {"Path": "a.py"}}]}
        for i in range(5)
    ]
    events.append({
        "step": 5,
        "error": "ValueError: Invalid parameter\n" + ("  at frame.py line 1\n" * 40) + "ZeroDivisionError: division by zero",
    })

    compressed = apply_rle_and_distillation(events)
    assert len(compressed) == 2
    assert compressed[0]["type"] == "REPEATED_TOOL_LOOP"
    assert compressed[0]["repeat_count"] == 5
    assert "omitted internal trace" in compressed[1]["error"]
    print("PASS: test_stage2_rle_and_distillation")


def test_stage3_phase_aggregation():
    events = [
        {"step": i, "tools": [{"name": "read_file", "args": {"Path": f"file_{i}.py"}}]}
        for i in range(6)
    ]
    events.append({
        "step": 6,
        "tools": [{"name": "edit_file", "args": {"Path": "file_0.py"}}],
    })
    events.append({
        "step": 7,
        "content": "Final response",
    })

    phased = aggregate_inspection_phases(events)
    phase_events = [e for e in phased if e.get("phase") == "CODEBASE_INSPECTION"]
    assert len(phase_events) >= 1
    edit_events = [e for e in phased if any(t.get("name") == "edit_file" for t in e.get("tools", []))]
    assert len(edit_events) == 1
    print("PASS: test_stage3_phase_aggregation")


def test_stage4_priority_sieve_strict_budget():
    events = []
    events.append({"step": 0, "type": "USER_INPUT", "content": "Initial user request"})
    for i in range(1, 98):
        events.append({"step": i, "tools": [{"name": "read_file", "args": {"Path": f"deep/dir/file_{i}.py"}}]})
    events.append({"step": 98, "tools": [{"name": "edit_file", "args": {"Path": "target.py"}}]})
    events.append({"step": 99, "content": "Finished implementing everything completely!"})

    sieved = apply_priority_sieve(events, budget=200)
    assert estimate_tokens(sieved) <= 250
    has_user_input = any(e.get("type") == "USER_INPUT" for e in sieved)
    has_edit = any(any(t.get("name") == "edit_file" for t in e.get("tools", [])) for e in sieved)
    has_final = any("Finished implementing" in str(e.get("content")) for e in sieved)
    assert has_user_input
    assert has_edit
    assert has_final
    print("PASS: test_stage4_priority_sieve_strict_budget")


def test_end_to_end_pipeline():
    interaction = {
        "interaction_index": 0,
        "goal": "Audit and fix security flaws",
        "status": "COMPLETED",
        "events": [
            {
                "conversation_metadata": {
                    "step_index": 0,
                    "type": "USER_INPUT",
                    "content_text": "Audit and fix security flaws",
                }
            },
            *[
                {
                    "conversation_metadata": {
                        "step_index": i,
                        "type": "PLANNER_RESPONSE",
                        "tool_calls": [{"name": "read_file", "args": {"Path": f"src/mod_{i % 5}.py"}}],
                    }
                }
                for i in range(1, 25)
            ],
            {
                "conversation_metadata": {
                    "step_index": 25,
                    "type": "PLANNER_RESPONSE",
                    "status": "COMPLETED",
                    "content_text": "All vulnerabilities resolved and tested.",
                }
            },
        ],
    }

    state, meta = compact_interaction_for_systemone(interaction, context_window=4096)
    assert "original_goal" in state
    assert "evidence_ledger" in state
    assert "events" in state
    assert "compaction_stage" in meta
    assert meta["final_tokens"] <= meta["budget"] + 500
    print(f"PASS: test_end_to_end_pipeline -> Stage: {meta['compaction_stage']}, Tokens: {meta['final_tokens']}/{meta['budget']}")


if __name__ == "__main__":
    test_token_estimation()
    test_budget_calculation()
    test_evidence_ledger_extraction()
    test_stage1_deduplication()
    test_stage2_rle_and_distillation()
    test_stage3_phase_aggregation()
    test_stage4_priority_sieve_strict_budget()
    test_end_to_end_pipeline()
    print("\nALL 8 TESTS PASSED SUCCESSFULLY!")
