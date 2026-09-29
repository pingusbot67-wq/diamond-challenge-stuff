"""The SEEN AI pipeline: audio -> transcript -> senior-friendly summary, plus "Ask SEEN".

Transcription runs locally with faster-whisper (free, and audio never leaves the computer).
Summaries and answers come from Claude via the Anthropic API.

Set SEEN_DEMO_MODE=1 to skip both and return canned results (for practicing the pitch
or demoing somewhere with no internet).
"""

import json
import os

MODEL = "claude-opus-5-5"
DEMO_MODE = os.environ.get("SEEN_DEMO_MODE") == "1"
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")  # "small.en" is more accurate, slower

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "people": {"type": "array", "items": {"type": "string"}},
        "things_to_remember": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["appointment", "medication", "task", "contact", "other"],
                    },
                    "text": {"type": "string"},
                    "when": {"type": "string"},
                },
                "required": ["kind", "text", "when"],
                "additionalProperties": False,
            },
        },
        "scam_warning": {
            "type": "object",
            "properties": {
                "suspicious": {"type": "boolean"},
                "reason": {"type": "string"},
            },
            "required": ["suspicious", "reason"],
            "additionalProperties": False,
        },
    },
    "required": ["title", "summary", "people", "things_to_remember", "scam_warning"],
    "additionalProperties": False,
}

SUMMARY_SYSTEM = """You help older adults remember their conversations. You receive an \
automatic transcript of a conversation recorded by the person's SEEN device (it may contain \
transcription mistakes and has no speaker labels).

Write for the older adult themselves: warm, respectful, plain English at about a 6th-grade \
reading level, short sentences, no jargon. Never talk down to them.

- title: 3-6 words, e.g. "Visit with Dr. Patel".
- summary: 2-5 sentences covering what the conversation was about and anything decided.
- people: names or roles of the people who spoke or were mentioned as important.
- things_to_remember: every concrete item they may need later - appointments (date, time, \
place), medication changes (name, dose, when to take it, start/stop), tasks, phone numbers \
or contacts. Copy numbers, doses and dates exactly as said. Put the date or time in "when", \
or "" if none. Leave the list empty if there is nothing.
- scam_warning: set suspicious to true only if the conversation shows common fraud signs \
(pressure to act right now, gift cards or wire transfers or crypto, a "grandchild in trouble", \
requests for passwords, Social Security or bank numbers, threats of arrest, prizes that need a \
fee). Explain why in one or two simple sentences. Otherwise false with reason "".

Only include what is in the transcript. If something is unclear, say it was unclear instead \
of guessing - medical details must never be invented."""

ASK_SYSTEM = """You are SEEN, a memory helper for an older adult. Answer their question (or \
their family member's question) using ONLY the conversation records provided. Answer in 1-4 \
short, plain sentences and say which conversation (title and date) the answer came from. If \
the records don't contain the answer, say so kindly and suggest who they could ask (for \
example, calling the doctor's office). Never guess about medications or doses."""

_whisper = None
_client = None


def _claude():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment
    return _client


def _ask_claude(system: str, user_text: str, output_format: dict | None = None) -> str:
    output_config = {"effort": "medium"}
    if output_format:
        output_config["format"] = output_format
    response = _claude().beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": user_text}],
        output_config=output_config,
        # If Claude's safety filters decline (e.g. a transcript mentioning medicines),
        # automatically retry on Anthropic's recommended fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined to process this recording")
    if response.stop_reason == "max_tokens":
        raise RuntimeError("Claude's response was cut off")
    return "".join(block.text for block in response.content if block.type == "text")


def transcribe(audio_path: str) -> str:
    if DEMO_MODE:
        return DEMO_TRANSCRIPT
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    segments, _info = _whisper.transcribe(audio_path, vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments).strip()


def summarize(transcript: str, recorded_at: str) -> dict:
    if DEMO_MODE:
        return DEMO_SUMMARY
    if not transcript:
        return {
            "title": "Nothing heard",
            "summary": "SEEN didn't pick up any talking in this recording.",
            "people": [],
            "things_to_remember": [],
            "scam_warning": {"suspicious": False, "reason": ""},
        }
    text = _ask_claude(
        SUMMARY_SYSTEM,
        f"Recorded: {recorded_at}\n\n<transcript>\n{transcript}\n</transcript>",
        output_format={"type": "json_schema", "schema": SUMMARY_SCHEMA},
    )
    return json.loads(text)


def answer_question(question: str, records: list[dict]) -> str:
    """records: [{"title", "recorded_at", "summary", "transcript"}, ...] newest first."""
    if DEMO_MODE:
        return (
            "Dr. Patel said to take your new blood pressure pill, lisinopril 10 mg, once every "
            "morning starting tomorrow. (From \"Visit with Dr. Patel\", Oct 14.)"
        )
    if not records:
        return "I don't have any recorded conversations yet."
    blocks = []
    for r in records:
        blocks.append(
            f"<conversation title=\"{r['title']}\" date=\"{r['recorded_at']}\">\n"
            f"Summary: {r['summary']}\nTranscript: {r['transcript']}\n</conversation>"
        )
    return _ask_claude(ASK_SYSTEM, "\n\n".join(blocks) + f"\n\nQuestion: {question}").strip()


DEMO_TRANSCRIPT = (
    "Good morning Margaret, how have you been feeling? Pretty good, a little dizzy some "
    "mornings. Okay, your blood pressure is a bit high today, 152 over 90. I'd like to start "
    "you on lisinopril, 10 milligrams, once every morning starting tomorrow. Keep taking your "
    "metformin like before. Let's get blood work done before your next visit, and I want to "
    "see you again on November 12th at 10:30. If the dizziness gets worse, call the office at "
    "302-555-0148."
)

DEMO_SUMMARY = {
    "title": "Visit with Dr. Patel",
    "summary": (
        "You saw Dr. Patel for a checkup. Your blood pressure was a little high (152/90), so "
        "the doctor started a new blood pressure medicine. Keep taking your metformin the same "
        "way. The doctor wants blood work before your next visit."
    ),
    "people": ["Dr. Patel"],
    "things_to_remember": [
        {"kind": "medication", "text": "Start lisinopril 10 mg, once every morning", "when": "Starting tomorrow"},
        {"kind": "medication", "text": "Keep taking metformin the same as before", "when": ""},
        {"kind": "task", "text": "Get blood work done", "when": "Before November 12"},
        {"kind": "appointment", "text": "Next visit with Dr. Patel", "when": "November 12 at 10:30 AM"},
        {"kind": "contact", "text": "Call the office if dizziness gets worse: 302-555-0148", "when": ""},
    ],
    "scam_warning": {"suspicious": False, "reason": ""},
}
