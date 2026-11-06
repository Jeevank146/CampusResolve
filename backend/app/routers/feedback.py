
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.database import engine
from app.routers.auth import get_current_user

router = APIRouter(
    prefix="/api/feedback",
    tags=["Student Feedback"],
)


class FeedbackCreate(BaseModel):
    feedback_type: Literal[
        "AI_RESPONSE",
        "GRIEVANCE_RESOLUTION"
    ]
    rating: int = Field(ge=1, le=5)
    helpful: bool | None = None
    comments: str | None = Field(default=None, max_length=2000)
    query_text: str | None = Field(default=None, max_length=5000)
    ticket_code: str | None = None


def get_student_registration(user: dict) -> str:
    registration = (
        user.get("registration_number")
        or user.get("sub")
        or user.get("username")
    )
    if not registration:
        raise HTTPException(401, "Student registration not found in login token.")
    return str(registration).strip().upper()


@router.post("")
def submit_feedback(
    payload: FeedbackCreate,
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "Student":
        raise HTTPException(403, "Only students can submit feedback.")

    registration = get_student_registration(user)

    with engine.begin() as connection:
        if payload.feedback_type == "GRIEVANCE_RESOLUTION":
            if not payload.ticket_code:
                raise HTTPException(400, "Ticket code is required.")

            ticket = connection.execute(
                text("""
                    SELECT ticket_code
                    FROM grievances
                    WHERE ticket_code = :ticket_code
                    AND UPPER(registration_number) = :registration
                """),
                {
                    "ticket_code": payload.ticket_code,
                    "registration": registration,
                },
            ).first()

            if not ticket:
                raise HTTPException(404, "Your grievance ticket was not found.")

        result = connection.execute(
            text("""
                INSERT INTO student_feedback (
                    registration_number,
                    feedback_type,
                    ticket_code,
                    query_text,
                    rating,
                    helpful,
                    comments
                )
                VALUES (
                    :registration,
                    :feedback_type,
                    :ticket_code,
                    :query_text,
                    :rating,
                    :helpful,
                    :comments
                )
                RETURNING id, created_at
            """),
            {
                "registration": registration,
                "feedback_type": payload.feedback_type,
                "ticket_code": payload.ticket_code,
                "query_text": payload.query_text,
                "rating": payload.rating,
                "helpful": payload.helpful,
                "comments": payload.comments,
            },
        ).mappings().one()

    return {
        "status": "success",
        "message": "Feedback submitted successfully.",
        "feedback_id": result["id"],
        "created_at": result["created_at"],
    }


@router.get("")
def get_feedback(
    user: dict = Depends(get_current_user),
):
    if user.get("role") != "Admin":
        raise HTTPException(403, "Admin access required.")

    with engine.connect() as connection:
        rows = connection.execute(
            text("""
                SELECT *
                FROM student_feedback
                ORDER BY created_at DESC
            """)
        ).mappings().all()

    return [dict(row) for row in rows]
