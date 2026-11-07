from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import logging
import os
import secrets
import time

import cloudinary
import cloudinary.uploader
import httpx

from cloudinary.utils import private_download_url
from pydantic import BaseModel, EmailStr, Field

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    status,
    Response,
    File,
    Form,
    UploadFile,
)

from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from app.routers.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import Grievance, GrievanceUpdate
from app.student_account import StudentAccount
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


# ---------------------------------------------------------
# GRIEVANCE EMAIL NOTIFICATIONS
# ---------------------------------------------------------

def department_email_for(department: str) -> str:
    """Return the configured notification address for a department.

    The department may be stored as a short category (for example, Academics)
    or as the full routing-office name (for example, Examination Cell).
    """
    value = (department or "").strip().lower()

    if "academic" in value:
        key = "ACADEMICS"
    elif "exam" in value:
        key = "EXAMINATIONS"
    elif "hostel" in value:
        key = "HOSTEL"
    elif "transport" in value or "bus" in value:
        key = "TRANSPORT"
    elif "admin" in value:
        key = "ADMINISTRATION"
    else:
        key = "OTHER"

    return getattr(
    settings,
    f"campusresolve_department_email_{key.lower()}",
    "",
).strip().lower()


def trigger_grievance_notification(
    event: str,
    record: Grievance,
    *,
    resolution_note: str = "",
) -> None:
    """Send a grievance event to the n8n email-notification workflow.

    Notification failures are logged and never roll back a saved grievance.
    """
    webhook_url = getattr(
        settings, "n8n_grievance_notifications_webhook_url", ""
    )

    if not webhook_url:
        logger.warning(
            "Grievance notification webhook is not configured; skipped %s for %s",
            event,
            record.ticket_code,
        )
        return

    payload = {
        "event": event,
        "ticket_code": record.ticket_code,
        "student_email": (record.student_email or "").strip().lower(),
        "student_name": record.student_name or "",
        "subject": record.subject or "",
        "description": record.description or "",
        "category": record.category or "",
        "priority": record.priority or "",
        "urgency": record.urgency or "",
        "department": record.assigned_department or "",
    }

    if event == "department_assigned":
        department_email = department_email_for(
            record.assigned_department or ""
        )

        if not department_email:
            logger.warning(
                "No notification email configured for department '%s'; "
                "department email skipped for ticket %s",
                record.assigned_department,
                record.ticket_code,
            )
            return

        payload["department_email"] = department_email

    if event == "ticket_resolved":
        payload["resolution_note"] = (
            resolution_note
            or "Your grievance has been marked as resolved."
        )

    try:
        response = httpx.post(
            webhook_url,
            json=payload,
            timeout=5.0,
        )
        response.raise_for_status()

        logger.info(
            "Triggered %s email notification for ticket %s",
            event,
            record.ticket_code,
        )

    except Exception:
        # Email workflow problems must not undo the successful database update.
        logger.exception(
            "Grievance notification trigger failed: event=%s ticket=%s",
            event,
            record.ticket_code,
        )


# ---------------------------------------------------------
# EMAIL OTP MODELS
# ---------------------------------------------------------

class EmailOTPRequest(BaseModel):
    registration_number: str = Field(min_length=3, max_length=64)
    student_name: str = Field(min_length=2, max_length=160)
    student_email: EmailStr


class EmailOTPVerifyRequest(BaseModel):
    registration_number: str = Field(min_length=3, max_length=64)

    # Optional for compatibility with older StudentDashboard builds.
    student_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=160,
    )

    student_email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


# ---------------------------------------------------------
# EMAIL OTP FUNCTIONS
# ---------------------------------------------------------

def ensure_email_otp_table(db: Session) -> None:
    """Create the OTP table without changing the existing ORM models."""
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS campusresolve_email_otp (
                registration_number VARCHAR(64) PRIMARY KEY,
                student_email VARCHAR(320) NOT NULL,
                otp_hash CHAR(64) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                verified_at TIMESTAMPTZ NULL
            )
            """
        )
    )
    db.commit()


def normalize_registration_number(value: str) -> str:
    return value.strip().upper()


def require_student_registration(
    registration_number: str,
    current_user: dict,
) -> str:
    if current_user.get("role") != "Student":
        raise HTTPException(
            status_code=403,
            detail="Only an authenticated student can verify an email.",
        )

    token_registration = normalize_registration_number(
        current_user.get("registration_number")
        or current_user.get("sub")
        or ""
    )

    requested_registration = normalize_registration_number(
        registration_number
    )

    if (
        not token_registration
        or requested_registration != token_registration
    ):
        raise HTTPException(
            status_code=403,
            detail="You can verify an email only for your own registration number.",
        )

    return requested_registration


def otp_digest(
    registration_number: str,
    email: str,
    otp: str,
) -> str:
    secret = settings.jwt_secret_key.get_secret_value()

    if not secret:
        raise HTTPException(
            status_code=503,
            detail="JWT secret is not configured; OTP verification is unavailable.",
        )

    message = f"{registration_number}|{email}|{otp}".encode("utf-8")

    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


def save_verified_student_account(
    db: Session,
    registration_number: str,
    student_name: str,
    student_email: str,
) -> None:
    """Save the student identity after their email OTP has been verified."""
    normalized_registration = registration_number.strip().upper()
    normalized_email = student_email.strip().lower()
    now = utc_now()

    account = db.scalar(
        select(StudentAccount).where(
            StudentAccount.registration_number == normalized_registration
        )
    )

    if account is None:
        account = StudentAccount(
            registration_number=normalized_registration,
            student_name=student_name.strip(),
            student_email=normalized_email,
            email_verified_at=now,
        )
        db.add(account)

    else:
        account.student_name = student_name.strip()
        account.student_email = normalized_email
        account.email_verified_at = now
        account.updated_at = now

    db.commit()


def require_email_verification(
    db: Session,
    registration_number: str,
    student_email: str,
) -> None:
    """Block text and photo grievance creation unless this email has a valid OTP."""
    ensure_email_otp_table(db)

    email = student_email.strip().lower()

    verified = db.execute(
        text(
            """
            SELECT 1
            FROM campusresolve_email_otp
            WHERE registration_number = :registration_number
              AND student_email = :student_email
              AND verified_at IS NOT NULL
              AND expires_at > :now
            """
        ),
        {
            "registration_number": registration_number,
            "student_email": email,
            "now": utc_now(),
        },
    ).first()

    if not verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email with the OTP before submitting a grievance.",
        )


def consume_email_verification(
    db: Session,
    registration_number: str,
    student_email: str,
) -> None:
    db.execute(
        text(
            """
            DELETE FROM campusresolve_email_otp
            WHERE registration_number = :registration_number
              AND student_email = :student_email
            """
        ),
        {
            "registration_number": registration_number,
            "student_email": student_email.strip().lower(),
        },
    )
    db.commit()


# ---------------------------------------------------------
# SEND GRIEVANCE EMAIL OTP
# ---------------------------------------------------------

@router.post("/send-otp")
def send_grievance_email_otp(
    payload: EmailOTPRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    registration_number = require_student_registration(
        payload.registration_number,
        current_user,
    )

    email = str(payload.student_email).strip().lower()

    webhook_url = (
        getattr(settings, "n8n_otp_webhook_url", "")
        or "http://localhost:5678/webhook/campusresolve/send-otp"
    )

    if not webhook_url:
        raise HTTPException(
            status_code=503,
            detail="OTP webhook is not configured. Add N8N_OTP_WEBHOOK_URL to backend settings.",
        )

    ensure_email_otp_table(db)

    existing = db.execute(
        text(
            """
            SELECT created_at, student_email
            FROM campusresolve_email_otp
            WHERE registration_number = :registration_number
            """
        ),
        {
            "registration_number": registration_number
        },
    ).mappings().first()

    now = utc_now()

    if (
        existing
        and existing["student_email"] == email
        and existing["created_at"] > now - timedelta(seconds=60)
    ):
        raise HTTPException(
            status_code=429,
            detail="Please wait 60 seconds before requesting another OTP.",
        )

    otp = f"{secrets.randbelow(900000) + 100000:06d}"

    db.execute(
        text(
            """
            INSERT INTO campusresolve_email_otp
                (registration_number, student_email, otp_hash, created_at,
                 expires_at, attempts, verified_at)
            VALUES
                (:registration_number, :student_email, :otp_hash, :created_at,
                 :expires_at, 0, NULL)
            ON CONFLICT (registration_number)
            DO UPDATE SET
                student_email = EXCLUDED.student_email,
                otp_hash = EXCLUDED.otp_hash,
                created_at = EXCLUDED.created_at,
                expires_at = EXCLUDED.expires_at,
                attempts = 0,
                verified_at = NULL
            """
        ),
        {
            "registration_number": registration_number,
            "student_email": email,
            "otp_hash": otp_digest(
                registration_number,
                email,
                otp,
            ),
            "created_at": now,
            "expires_at": now + timedelta(minutes=5),
        },
    )
    db.commit()

    try:
        response = httpx.post(
            webhook_url,
            json={
                "event": "campusresolve.email_otp",
                "to": email,
                "student_email": email,
                "student_name": payload.student_name.strip(),
                "registration_number": registration_number,
                "otp": otp,
                "expires_in_minutes": 5,
                "subject": "CampusResolve email verification",
            },
            timeout=15.0,
        )

        response.raise_for_status()

    except Exception:
        logger.exception(
            "Unable to send CampusResolve OTP to %s",
            email,
        )

        db.execute(
            text(
                "DELETE FROM campusresolve_email_otp "
                "WHERE registration_number = :registration_number"
            ),
            {
                "registration_number": registration_number
            },
        )
        db.commit()

        raise HTTPException(
            status_code=502,
            detail="Unable to send the OTP email. Check the n8n Gmail workflow.",
        )

    return {
        "sent": True,
        "message": f"OTP sent to {email}. It expires in 5 minutes.",
    }


# ---------------------------------------------------------
# VERIFY GRIEVANCE EMAIL OTP
# ---------------------------------------------------------

@router.post("/verify-otp")
def verify_grievance_email_otp(
    payload: EmailOTPVerifyRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    registration_number = require_student_registration(
        payload.registration_number,
        current_user,
    )

    email = str(payload.student_email).strip().lower()

    student_name = (payload.student_name or "").strip()

    if not student_name:
        # Older frontend versions do not send student_name in the verify request.
        # Reuse the student's name from their most recent saved grievance.
        student_name = db.scalar(
            select(Grievance.student_name)
            .where(
                Grievance.registration_number == registration_number
            )
            .order_by(Grievance.created_at.desc())
            .limit(1)
        ) or registration_number

    ensure_email_otp_table(db)

    record = db.execute(
        text(
            """
            SELECT otp_hash, expires_at, attempts, verified_at
            FROM campusresolve_email_otp
            WHERE registration_number = :registration_number
              AND student_email = :student_email
            """
        ),
        {
            "registration_number": registration_number,
            "student_email": email,
        },
    ).mappings().first()

    if not record:
        raise HTTPException(
            status_code=400,
            detail="OTP not found. Request a new verification code.",
        )

    now = utc_now()

    if record["expires_at"] <= now:
        db.execute(
            text(
                "DELETE FROM campusresolve_email_otp "
                "WHERE registration_number = :registration_number"
            ),
            {
                "registration_number": registration_number
            },
        )
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP expired. Request a new verification code.",
        )

    # If the OTP was already verified, ensure the student account is also saved.
    if record["verified_at"] is not None:
        save_verified_student_account(
            db,
            registration_number,
            student_name,
            email,
        )

        return {
            "verified": True,
            "message": "Email already verified. Student account saved.",
        }

    if record["attempts"] >= 5:
        db.execute(
            text(
                "DELETE FROM campusresolve_email_otp "
                "WHERE registration_number = :registration_number"
            ),
            {
                "registration_number": registration_number
            },
        )
        db.commit()

        raise HTTPException(
            status_code=429,
            detail="Too many incorrect attempts. Request a new OTP.",
        )

    expected_hash = otp_digest(
        registration_number,
        email,
        payload.otp,
    )

    if not hmac.compare_digest(
        expected_hash,
        record["otp_hash"].strip(),
    ):
        attempts = record["attempts"] + 1

        if attempts >= 5:
            db.execute(
                text(
                    "DELETE FROM campusresolve_email_otp "
                    "WHERE registration_number = :registration_number"
                ),
                {
                    "registration_number": registration_number
                },
            )

        else:
            db.execute(
                text(
                    """
                    UPDATE campusresolve_email_otp
                    SET attempts = :attempts
                    WHERE registration_number = :registration_number
                    """
                ),
                {
                    "attempts": attempts,
                    "registration_number": registration_number,
                },
            )

        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Incorrect OTP. Please check the code and try again.",
        )

    # Mark OTP verified and extend its validity for the grievance submission.
    db.execute(
        text(
            """
            UPDATE campusresolve_email_otp
            SET verified_at = :verified_at,
                expires_at = :expires_at
            WHERE registration_number = :registration_number
              AND student_email = :student_email
            """
        ),
        {
            "verified_at": now,
            "expires_at": now + timedelta(minutes=10),
            "registration_number": registration_number,
            "student_email": email,
        },
    )
    db.commit()

    # Persist the verified email for future Forgot Password requests.
    save_verified_student_account(
        db,
        registration_number,
        student_name,
        email,
    )

    return {
        "verified": True,
        "message": "Email verified successfully. Student account saved.",
    }


# ---------------------------------------------------------
# CLOUDINARY SIGNED IMAGE URL
# ---------------------------------------------------------

def add_signed_image_url(record: Grievance) -> Grievance:
    """
    Attach a short-lived signed Cloudinary URL to a grievance response.

    The permanent Cloudinary reference remains image_public_id + image_format
    in the database. The signed URL is generated on demand and is not stored.
    """
    record.image_url = None

    if not record.image_public_id or not record.image_format:
        return record

    if not all(
        [
            settings.cloudinary_cloud_name,
            settings.cloudinary_api_key,
            settings.cloudinary_api_secret.get_secret_value(),
        ]
    ):
        logger.warning(
            "Cloudinary is not configured; no image URL generated for ticket %s",
            record.ticket_code,
        )
        return record

    try:
        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret.get_secret_value(),
            secure=True,
        )

        record.image_url = private_download_url(
            record.image_public_id,
            record.image_format,
            resource_type="image",
            type="private",
            expires_at=int(time.time()) + 900,
        )

    except Exception:
        logger.exception(
            "Unable to generate signed image URL for ticket %s",
            record.ticket_code,
        )
        record.image_url = None

    return record


# ---------------------------------------------------------
# GENERAL HELPERS
# ---------------------------------------------------------

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


def find_grievance(
    ticket_code: str,
    db: Session,
) -> Grievance:
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


def check_ticket_permission(
    record: Grievance,
    user: dict,
):
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


# ---------------------------------------------------------
# 1. CREATE A TEXT-BASED GRIEVANCE
# ---------------------------------------------------------

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

    normalized_email = str(payload.student_email).strip().lower()

    require_email_verification(
        db,
        token_registration,
        normalized_email,
    )

    record = Grievance(
        ticket_code=make_ticket_code(),
        registration_number=payload.registration_number.strip().upper(),
        student_name=payload.student_name.strip(),
        student_email=normalized_email,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        category="Other",
        priority="Medium",
        urgency="Normal",
        status="Open",
        assigned_department="Pending verification",
        submission_type="text",
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

    consume_email_verification(
        db,
        token_registration,
        normalized_email,
    )

    # Send student confirmation after the grievance is safely saved.
    trigger_grievance_notification(
        "ticket_created",
        saved_record,
    )

    # Trigger Triage Agent through Supervisor.
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


# ---------------------------------------------------------
# 2. CREATE A PHOTO-BASED GRIEVANCE
# ---------------------------------------------------------

@router.post(
    "/photo",
    response_model=GrievanceRead,
    status_code=status.HTTP_201_CREATED,
)
def create_photo_grievance(
    registration_number: str = Form(...),
    student_name: str = Form(...),
    student_email: EmailStr = Form(...),
    subject: str = Form(..., min_length=4, max_length=180),
    description: str = Form(..., min_length=10, max_length=5000),
    location: str = Form(default="", max_length=255),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get("role") != "Student":
        raise HTTPException(
            status_code=403,
            detail="Only authenticated students can submit grievances.",
        )

    token_registration = (
        current_user.get("registration_number")
        or current_user.get("sub")
        or ""
    ).strip().upper()

    registration_number = registration_number.strip().upper()

    if registration_number != token_registration:
        raise HTTPException(
            status_code=403,
            detail="You can submit grievances only for your own registration number.",
        )

    normalized_email = str(student_email).strip().lower()

    require_email_verification(
        db,
        registration_number,
        normalized_email,
    )

    # Check Cloudinary configuration.
    if not all(
        [
            settings.cloudinary_cloud_name,
            settings.cloudinary_api_key,
            settings.cloudinary_api_secret.get_secret_value(),
        ]
    ):
        raise HTTPException(
            status_code=503,
            detail="Cloudinary storage is not configured.",
        )

    # Validate image size: maximum 8 MB.
    image.file.seek(0, 2)
    file_size = image.file.tell()
    image.file.seek(0)

    if file_size == 0 or file_size > 8 * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail="Image must be between 1 byte and 8 MB.",
        )

    # Validate actual image format.
    header = image.file.read(12)
    image.file.seek(0)

    if header.startswith(b"\xff\xd8\xff"):
        image_format = "jpg"

    elif header.startswith(b"\x89PNG\r\n\x1a\n"):
        image_format = "png"

    elif header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        image_format = "webp"

    else:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WEBP images are supported.",
        )

    # Configure Cloudinary.
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret.get_secret_value(),
        secure=True,
    )

    # Upload image privately to Cloudinary.
    try:
        upload_result = cloudinary.uploader.upload(
            image.file,
            resource_type="image",
            type="private",
            asset_folder="campusresolve/grievances",
            unique_filename=True,
            overwrite=False,
        )

    except Exception:
        logger.exception("Cloudinary image upload failed")

        raise HTTPException(
            status_code=502,
            detail="Unable to upload grievance image.",
        )

    public_id = upload_result["public_id"]
    stored_format = upload_result.get("format", image_format)

    # Create grievance record.
    record = Grievance(
        ticket_code=make_ticket_code(),
        registration_number=registration_number,
        student_name=student_name.strip(),
        student_email=normalized_email,
        subject=subject.strip(),
        description=description.strip(),
        category="Other",
        priority="Medium",
        urgency="Normal",
        status="Open",
        assigned_department="Pending verification",
        submission_type="photo",
        location=location.strip() or None,
        image_public_id=public_id,
        image_format=stored_format,
    )

    record.updates.append(
        GrievanceUpdate(
            status="Open",
            update_note="Photo-based grievance submitted successfully.",
            updated_by="System",
        )
    )

    db.add(record)

    try:
        saved_record = save_record(db, record)

    except Exception:
        # Remove uploaded image if database save fails.
        try:
            cloudinary.uploader.destroy(
                public_id,
                resource_type="image",
                type="private",
            )

        except Exception:
            logger.exception("Unable to clean up uploaded image")

        raise

    consume_email_verification(
        db,
        registration_number,
        normalized_email,
    )

    # Send student confirmation after the grievance is safely saved.
    trigger_grievance_notification(
        "ticket_created",
        saved_record,
    )

    # Generate a temporary signed URL for Vision Agent.
    try:
        image_url = private_download_url(
            public_id,
            stored_format,
            resource_type="image",
            type="private",
            expires_at=int(time.time()) + 900,
        )

    except Exception:
        logger.exception(
            "Unable to generate private image URL for ticket %s",
            saved_record.ticket_code,
        )

        raise HTTPException(
            status_code=502,
            detail="Image was saved, but its temporary access URL could not be generated.",
        )

    # Trigger Vision Agent through Supervisor.
    try:
        response = httpx.post(
            settings.n8n_supervisor_webhook_url,
            json={
                "event": "grievance.vision",
                "source": "fastapi",
                "message": (
                    f"Subject: {saved_record.subject}\n"
                    f"Description: {saved_record.description}\n"
                    f"Location: {saved_record.location or 'Not provided'}"
                ),
                "context": {
                    "ticket_code": saved_record.ticket_code,
                    "registration_number": saved_record.registration_number,
                    "student_name": saved_record.student_name,
                    "student_email": saved_record.student_email,
                    "description": saved_record.description,
                    "location": saved_record.location or "",
                    "image_url": image_url,
                },
            },
            timeout=10.0,
        )

        response.raise_for_status()

    except Exception:
        logger.exception(
            "Vision workflow trigger failed for ticket %s",
            saved_record.ticket_code,
        )

    return saved_record


# ---------------------------------------------------------
# 3. LIST GRIEVANCES
# ---------------------------------------------------------

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

    records = list(db.scalars(statement).all())

    return [
        add_signed_image_url(record)
        for record in records
    ]


# ---------------------------------------------------------
# 4. GET GRIEVANCE USING TICKET CODE
# ---------------------------------------------------------

@router.get(
    "/{ticket_code}",
    response_model=GrievanceRead,
)
def get_grievance(
    ticket_code: str,
    db: Session = Depends(get_db),
):
    return find_grievance(ticket_code, db)


# ---------------------------------------------------------
# 5. STUDENT DELETES THEIR OWN GRIEVANCE
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# 6. UPDATE GRIEVANCE STATUS
# ---------------------------------------------------------

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

    previous_status = (record.status or "").strip()

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

    saved_record = save_record(db, record)

    # Send resolution email only when the status changes into
    # Resolved or Closed. Repeated updates will not send duplicates.
    if (
        payload.status in ("Resolved", "Closed")
        and previous_status not in ("Resolved", "Closed")
    ):
        trigger_grievance_notification(
            "ticket_resolved",
            saved_record,
            resolution_note=payload.update_note.strip(),
        )

    return saved_record


# ---------------------------------------------------------
# 7. SAVE AI CLASSIFICATION FROM TRIAGE AGENT
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# 8. SAVE DEPARTMENT ASSIGNMENT FROM ROUTING AGENT
# ---------------------------------------------------------

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
    previous_department = (
        record.assigned_department or ""
    ).strip()

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

    saved_record = save_record(db, record)

    # Notify the department only when its assignment changes.
    if department and department != previous_department:
        trigger_grievance_notification(
            "department_assigned",
            saved_record,
        )

    return saved_record


# ---------------------------------------------------------
# 9. STUDENT CONFIRMS GRIEVANCE RESOLUTION
# ---------------------------------------------------------

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

    saved_record = save_record(db, record)

    trigger_grievance_notification(
        "ticket_resolved",
        saved_record,
        resolution_note="Student confirmed that the issue has been resolved.",
    )

    return saved_record