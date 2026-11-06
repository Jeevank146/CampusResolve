
from typing import Any
import json
import httpx

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings

router = APIRouter(prefix="/api/automation", tags=["automation"])


class SupervisorRequest(BaseModel):
    event: str = "campusresolve.test"
    source: str = "fastapi"
    message: str = Field(min_length=1, max_length=5000)
    context: dict[str, Any] = Field(default_factory=dict)


def extract_answer(data: Any, depth: int = 0) -> str:
    if depth > 10 or data is None:
        return ""

    if isinstance(data, list):
        for item in data:
            answer = extract_answer(item, depth + 1)
            if answer:
                return answer
        return ""

    if isinstance(data, str):
        value = data.strip()
        if not value or "workflow was started" in value.lower():
            return ""
        try:
            return extract_answer(json.loads(value), depth + 1)
        except (ValueError, TypeError):
            return value

    if isinstance(data, dict):
        for key in (
            "answer", "response", "output", "text",
            "n8n_response", "data", "result", "body"
        ):
            if key in data:
                answer = extract_answer(data[key], depth + 1)
                if answer:
                    return answer

    return ""


@router.post("/supervisor")
async def trigger_supervisor(payload: SupervisorRequest):
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            result = await client.post(
                settings.n8n_supervisor_webhook_url,
                json=payload.model_dump(),
            )

    except httpx.TimeoutException:
        raise HTTPException(504, "AI request timed out.")

    except httpx.RequestError:
        raise HTTPException(502, "Cannot connect to n8n.")

    try:
        n8n_data = result.json()
    except ValueError:
        n8n_data = {"message": result.text}

    if not result.is_success:
        raise HTTPException(
            502,
            detail={"message": "n8n workflow failed", "response": n8n_data},
        )

    answer = extract_answer(n8n_data)

    if not answer:
        raise HTTPException(
            502,
            detail="Knowledge Agent completed without returning an answer.",
        )

    return {
        "status": "success",
        "agent": "knowledge",
        "answer": answer,
        "response": answer,
    }
