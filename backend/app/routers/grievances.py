from datetime import datetime, timezone
import logging
import secrets
from app.routers.auth import get_current_user
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Grievance, GrievanceUpdate
from app.schemas import (
    GrievanceCreate,
    GrievanceRead,
    GrievanceStatusUpdate,
    AIClassificationUpdate,
    DepartmentAssignmentUpdate,
)

router = APIRouter(
    prefix="/api/grievances",
    tags=["grievances"],
)

logger = logging.getLogger(__name__)


def utc_now():
    return datetime.now(timezone.utc)


def make_ticket_code() -> str:
    return (
        f"CR-{utc_now():%y%m%d}-"
        f"{secrets.token_hex(3).upper()}"
    )


def save_record(db: Session, record: Grievance):
    try:
        db.commit()
        db.refresh(record)
        return record
    except Exception:
        db.rollback()
        raise


def find_grievance(ticket_code: str, db: Session) -> Grievance:
    record = db.scalar(
        select(Grievance).where(
            Grievance.ticket_code == ticket_code
        )
    )

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Ticket not found",
        )

    return record
def check_ticket_permission(record: Grievance, user: dict):
    role = user.get("role")

    if role == "Admin":
        return

    if role == "Staff":
        staff_category = user.get("category")

        if record.category not in (staff_category, "Other"):
            raise HTTPException(
                status_code=403,
                detail="You cannot access another department's grievance.",
            )
        return

    raise HTTPException(
        status_code=403,
        detail="Student authentication is not enabled yet.",
    )

# 1. Create a new grievance and trigger Supervisor Agent
@router.post(
    "",
    response_model=GrievanceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_grievance(
    payload: GrievanceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "Student":
        raise HTTPException(
            status_code=403,
            detail="Only an authenticated student can submit a grievance.",
        )

    token_registration = (
        current_user.get("registration_number")
        or current_user.get("sub")
        or ""
    ).strip().upper()
    if payload.registration_number.strip().upper() != token_registration:
        raise HTTPException(
            status_code=403,
            detail="You can submit grievances only for your own registration number.",
        )

    record = Grievance(
        ticket_code=make_ticket_code(),
        registration_number=payload.registration_number.strip().upper(),
        student_name=payload.student_name.strip(),
        student_email=str(payload.student_email).strip().lower(),
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        category="Other",
        priority="Medium",
        urgency="Normal",
        status="Open",
        assigned_department="Pending verification",
    )

    record.updates.append(
        GrievanceUpdate(
            status="Open",
            update_note="Grievance submitted successfully.",
            updated_by="System",
        )
    )

    db.add(record)
    saved_record = save_record(db, record)

    # Trigger Triage Agent through Supervisor
    try:
        response = httpx.post(
            settings.n8n_supervisor_webhook_url,
            json={
                "event": "grievance.triage",
                "source": "fastapi",
                "message": (
                    f"Subject: {saved_record.subject}\n"
                    f"Description: {saved_record.description}"
                ),
                "context": {
                    "ticket_code": saved_record.ticket_code,
                    "registration_number": saved_record.registration_number,
                    "student_name": saved_record.student_name,
                    "student_email": saved_record.student_email,
                },
            },
            timeout=10.0,
        )
        response.raise_for_status()

    except Exception:
        logger.exception(
            "Supervisor workflow trigger failed for ticket %s",
            saved_record.ticket_code,
        )

    return saved_record


# 2. List all grievances or filter by student registration number
@router.get(
    "",
    response_model=list[GrievanceRead],
)
def list_grievances(
    registration_number: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    role = current_user.get("role")
    statement = select(Grievance)

    if role == "Admin":
        if registration_number:
            statement = statement.where(
                Grievance.registration_number
                == registration_number.strip().upper()
            )

    elif role == "Student":
        student_registration = (
            current_user.get("registration_number")
            or current_user.get("sub")
            or ""
        ).strip().upper()
        if not student_registration:
            raise HTTPException(
                status_code=403,
                detail="Student registration number is missing from the token.",
            )
        # Never trust a registration number supplied by the browser.
        statement = statement.where(
            Grievance.registration_number == student_registration
        )

    elif role == "Staff":
        staff_category = current_user.get("category")

        if staff_category not in (
            "Academics",
            "Examinations",
            "Hostel",
            "Transport",
            "Administration",
            "Other",
        ):
            raise HTTPException(
                status_code=403,
                detail="Invalid staff department.",
            )

        statement = statement.where(
            Grievance.category.in_([staff_category, "Other"])
        )

    else:
        raise HTTPException(
            status_code=403,
            detail="Unsupported account role.",
        )

    statement = (
        statement
        .order_by(Grievance.created_at.desc())
        .limit(limit)
    )

    return list(db.scalars(statement).all())

# 3. Get grievance using ticket code
@router.get(
    "/{ticket_code}",
    response_model=GrievanceRead,
)
def get_grievance(
    ticket_code: str,
    db: Session = Depends(get_db),
):
    return find_grievance(ticket_code, db)

# 4. Student deletes their own grievance
@router.delete(
    "/{ticket_code}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_grievance(
    ticket_code: str,
    registration_number: str = Query(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    token_registration = (
        current_user.get("registration_number")
        or current_user.get("sub")
        or ""
    ).strip().upper()
    if (
        current_user.get("role") != "Student"
        or registration_number.strip().upper() != token_registration
    ):
        raise HTTPException(
            status_code=403,
            detail="You can delete only your own grievance.",
        )

    record = find_grievance(ticket_code, db)

    if (
        not record.registration_number
        or record.registration_number.strip().upper()
        != registration_number.strip().upper()
    ):
        raise HTTPException(
            status_code=404,
            detail="Grievance not found for this student.",
        )

    try:
        # Delete associated update history first
        db.execute(
            delete(GrievanceUpdate).where(
                GrievanceUpdate.grievance_id == record.id
            )
        )

        db.delete(record)
        db.commit()

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to delete grievance.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
# 5. Update grievance status
@router.patch(
    "/{ticket_code}/status",
    response_model=GrievanceRead,
)
def update_grievance_status(
    ticket_code: str,
    payload: GrievanceStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    record = find_grievance(ticket_code, db)

    check_ticket_permission(record, current_user)

    record.status = payload.status
    record.updated_at = utc_now()

    update = GrievanceUpdate(
        grievance_id=record.id,
        status=payload.status,
        update_note=payload.update_note.strip(),
        updated_by=(
            "Admin"
            if current_user.get("role") == "Admin"
            else f"{current_user.get('category')} Staff"
        ),
    )

    db.add(update)
    return save_record(db, record)
# 5. Save AI classification from Triage Agent
@router.patch(
    "/{ticket_code}/classification",
    response_model=GrievanceRead,
)
def update_grievance_classification(
    ticket_code: str,
    payload: AIClassificationUpdate,
    db: Session = Depends(get_db),
):
    record = find_grievance(ticket_code, db)

    record.category = payload.category
    record.priority = payload.priority
    record.urgency = payload.urgency
    record.updated_at = utc_now()

    update = GrievanceUpdate(
        grievance_id=record.id,
        status=record.status,
        update_note=(
            "AI classification completed. "
            f"Category: {payload.category}. "
            f"Priority: {payload.priority}. "
            f"Urgency: {payload.urgency}. "
            f"Reason: {payload.reason.strip()}"
        ),
        updated_by="Triage Agent",
    )

    db.add(update)
    return save_record(db, record)


# 6. Save department assignment from Routing Agent
@router.patch(
    "/{ticket_code}/assignment",
    response_model=GrievanceRead,
)
def assign_grievance_department(
    ticket_code: str,
    payload: DepartmentAssignmentUpdate,
    db: Session = Depends(get_db),
):
    record = find_grievance(ticket_code, db)

    department = payload.department.strip()

    record.assigned_department = department
    record.updated_at = utc_now()

    update = GrievanceUpdate(
        grievance_id=record.id,
        status=record.status,
        update_note=(
            f"Department assigned: {department}. "
            f"Reason: {payload.reason.strip()}"
        ),
        updated_by="Routing Agent",
    )

    db.add(update)
    return save_record(db, record)
@router.post(
    "/{ticket_code}/confirm-resolution",
    response_model=GrievanceRead,
)
def confirm_resolution(
    ticket_code: str,
    registration_number: str = Query(...),
    db: Session = Depends(get_db),
):
    record = find_grievance(ticket_code, db)

    if (
        not record.registration_number
        or record.registration_number.strip().upper()
        != registration_number.strip().upper()
    ):
        raise HTTPException(
            status_code=403,
            detail="You cannot confirm another student's grievance.",
        )

    if record.status in ("Resolved", "Closed"):
        return record

    record.status = "Resolved"
    record.updated_at = utc_now()

    db.add(
        GrievanceUpdate(
            grievance_id=record.id,
            status="Resolved",
            update_note="Student confirmed that the issue has been resolved.",
            updated_by="Student",
        )
    )

    return save_record(db, record)
