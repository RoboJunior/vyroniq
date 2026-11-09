import json
import logging
import os
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load all the env variables
load_dotenv()

BACKEND_URL = os.environ.get("BACKEND_URL")
# If your backend has any security make sure u add that
# credentials aswell


# Later make it proactive
# compute the goal deviation for each step accumulate it and then
# break it if its deviating the goal

# Configure logging to write to a file
logging.basicConfig(
    filename="app.log",
    filemode="a",
    format="%(asctime)s - %(levelname)s - %(message)s",
    level=logging.DEBUG,
)


# Get the last event from conversation
def get_last_event(file_path: str):
    with open(file_path, "rb") as f:
        f.seek(0, 2)
        position = f.tell()
        while position > 0:
            position -= 1
            f.seek(position)
            if f.read(1) == b"\n":
                line = f.readline()
                if line.strip():
                    return json.loads(line)
        f.seek(0)
        line = f.readline()
        return json.loads(line) if line.strip() else None


# Parse the user message
def parse_user_content(content: str):
    sections = re.findall(
        r"<(USER_REQUEST|ADDITIONAL_METADATA|USER_SETTINGS_CHANGE)>\s*(.*?)\s*</\1>",
        content,
        re.DOTALL,
    )
    return {name.lower(): value.strip() for name, value in sections}


# Extract metadata from conversation
def extract_info_from_convo(conversation: dict):
    c_type = conversation.get("type")
    content = conversation.get("content")
    metadata = {
        "step_index": conversation.get("step_index"),
        "type": c_type,
        "source": conversation.get("source"),
        "status": conversation.get("status"),
        "created_at": conversation.get("created_at"),
        # Always a string or None
        "content_text": content if isinstance(content, str) else None,
    }
    if c_type == "USER_INPUT":
        metadata["content_sections"] = parse_user_content(content or "")
    elif c_type == "PLANNER_RESPONSE":
        metadata.update(
            {
                "input_tokens": conversation.get("input_tokens"),
                "cache_read_tokens": conversation.get("cache_read_tokens"),
                "output_tokens": conversation.get("output_tokens"),
                "tool_calls": conversation.get("tool_calls"),
            }
        )
    elif c_type == "GENERIC":
        pass
    return metadata


# Make a call to the backend
# with the all the parameters
def send_event(event: dict):
    url = f"{BACKEND_URL}/v1/antigravity/events"
    with httpx.Client(timeout=10.0) as client:
        response = client.post(url, json=event)
        response.raise_for_status()
        return response.json()


# function to extract transcript
def read_transcript(payload: dict):
    logging.info(f"Reading transcript from path: {payload.get('transcriptPath')}")
    # Extract the transcript path
    transcript_path = payload.get("transcriptPath")
    if not transcript_path:
        return None
    path = Path(transcript_path).expanduser()
    try:
        if path.is_file():
            # Read the last conversation from the transcript file
            last_conversation = get_last_event(file_path=transcript_path)
            conversation_metadata = extract_info_from_convo(
                conversation=last_conversation
            )
            return conversation_metadata
    except OSError as exc:
        logging.error(f"Transcript read failed: {exc}")


# Main function to process the information
def main():
    event_name = sys.argv[1] if len(sys.argv) > 1 else "Unknown"

    logging.info(f"New event coming in: {event_name}")

    with open("new.txt", "w", encoding="utf-8") as file:
        file.write(event_name)

    try:
        # Extract the payload
        payload = json.load(sys.stdin)

        # read the transcript
        conversation_metadata = read_transcript(payload=payload)

        # Extract the requried metadata from the payload
        payload = {
            "conversation_id": payload.get("conversationId"),
            "error": payload.get("error"),
            "execution_num": payload.get("executionNum"),
            "model_name": payload.get("modelName"),
            "termination_reason": payload.get("terminationReason"),
            "workspace_paths": payload.get("workspacePaths"),
            "conversation_metadata": conversation_metadata,
        }

        send_event(event=payload)

        logging.info(f"Successfully captured: {event_name}")

    except Exception as exc:
        logging.error(f"Failed {exc}")

    # Preserve antigravity's normal execution
    # Later add guides to guide the llm to more appropriate response
    # Right now only work on the observability and the goal alignment
    # later add custom decision to intercept antigravity's decision


if __name__ == "__main__":
    main()
