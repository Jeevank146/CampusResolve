from datetime import datetime, timedelta, timezone
import base64
import hashlib
import hmac
import logging
import secrets
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, Field, SecretStr
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.student_account import StudentAccount

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)

Category = Literal[
    "Academics",
    "Examinations",
    "Hostel",
    "Transport",
    "Administration",
    "Other",
]

PBKDF2_ITERATIONS = 600_000


class LoginRequest(BaseModel):
    role: Literal["Student", "Admin", "Staff"]
    password: SecretStr
    registration_number: str | None = None
    username: str | None = None
    staff_id: str | None = None
    category: Category | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    category: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordVerifyRequest(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^\d{6}$")


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_token: str = Field(min_length=20, max_length=256)
    new_password: str = Field(min_length=8, max_length=128)


STAFF_ACCOUNTS = {
    "Academics": ("ACADEMICS_STAFF", "staff_academics_password"),
    "Examinations": ("EXAM_STAFF", "staff_examinations_password"),
    "Hostel": ("HOSTEL_STAFF", "staff_hostel_password"),
    "Transport": ("TRANSPORT_STAFF", "staff_transport_password"),
    "Administration": ("ADMIN_STAFF", "staff_administration_password"),
    "Other": ("OTHER_STAFF", "staff_other_password"),
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(
    username: str,
    role: str,
    category: str | None = None,
    registration_number: str | None = None,
) -> str:
    secret = settings.jwt_secret_key.get_secret_value()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="JWT secret is not configured.",
        )

    expires = utc_now() + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {
        "sub": username,
        "role": role,
        "category": category,
        "registration_number": registration_number,
        "exp": expires,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    salt_text = base64.urlsafe_b64encode(salt).decode("ascii")
    digest_text = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_text}${digest_text}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = stored_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        if iterations < 100_000 or iterations > 2_000_000:
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, iterations
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def reset_digest(registration_number: str, purpose: str, value: str) -> str:
    secret = settings.jwt_secret_key.get_secret_value()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="JWT secret is not configured; password reset is unavailable.",
        )
    payload = f"{registration_number}|{purpose}|{value}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def ensure_password_reset_table(db: Session) -> None:
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS campusresolve_password_reset_otp (
                registration_number VARCHAR(64) PRIMARY KEY,
                otp_hash CHAR(64) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                verified_at TIMESTAMPTZ NULL,
                reset_token_hash CHAR(64) NULL,
                reset_token_expires_at TIMESTAMPTZ NULL
            )
            """
        )
    )
    db.commit()


def find_verified_student_by_email(db: Session, email: str) -> StudentAccount:
    """Find the student account associated with a previously verified email."""
    normalized_email = email.strip().lower()
    accounts = list(
        db.scalars(
            select(StudentAccount).where(
                StudentAccount.student_email == normalized_email,
                StudentAccount.email_verified_at.is_not(None),
            )
        ).all()
    )

    if not accounts:
        raise HTTPException(
            status_code=404,
            detail=(
                "This email is not linked to a verified CampusResolve student account. "
                "Use the same email address you verified during a grievance submission."
            ),
        )

    if len(accounts) > 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "This email is linked to more than one student account. "
                "Please contact CampusResolve support."
            ),
        )

    return accounts[0]


def send_reset_otp(payload: ForgotPasswordRequest, db: Session):
    email = str(payload.email).strip().lower()
    account = find_verified_student_by_email(db, email)
    registration_number = account.registration_number.strip().upper()

    ensure_password_reset_table(db)
    now = utc_now()
    existing = db.execute(
        text(
            """SELECT created_at FROM campusresolve_password_reset_otp
               WHERE registration_number = :registration_number"""
        ),
        {"registration_number": registration_number},
    ).mappings().first()
    if existing and existing["created_at"] > now - timedelta(seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Please wait 60 seconds before requesting another OTP.",
        )

    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    db.execute(
        text(
            """
            INSERT INTO campusresolve_password_reset_otp
                (registration_number, otp_hash, created_at, expires_at,
                 attempts, verified_at, reset_token_hash, reset_token_expires_at)
            VALUES
                (:registration_number, :otp_hash, :created_at, :expires_at,
                 0, NULL, NULL, NULL)
            ON CONFLICT (registration_number) DO UPDATE SET
                otp_hash = EXCLUDED.otp_hash,
                created_at = EXCLUDED.created_at,
                expires_at = EXCLUDED.expires_at,
                attempts = 0,
                verified_at = NULL,
                reset_token_hash = NULL,
                reset_token_expires_at = NULL
            """
        ),
        {
            "registration_number": registration_number,
            "otp_hash": reset_digest(registration_number, "otp", otp),
            "created_at": now,
            "expires_at": now + timedelta(minutes=5),
        },
    )
    db.commit()

    webhook_url = getattr(settings, "n8n_otp_webhook_url", "") or "http://localhost:5678/webhook/campusresolve/send-otp"
    try:
        response = httpx.post(
            webhook_url,
            json={
                "event": "campusresolve.password_reset_otp",
                "to": email,
                "student_email": email,
                "student_name": account.student_name,
                "registration_number": registration_number,
                "otp": otp,
                "expires_in_minutes": 5,
                "subject": "CampusResolve Password Reset OTP",
            },
            timeout=15.0,
        )
        response.raise_for_status()
    except Exception:
        logger.exception("Unable to send password reset OTP for %s", registration_number)
        db.execute(
            text(
                "DELETE FROM campusresolve_password_reset_otp "
                "WHERE registration_number = :registration_number"
            ),
            {"registration_number": registration_number},
        )
        db.commit()
        raise HTTPException(
            status_code=502,
            detail="Unable to send the password reset email. Check the n8n Gmail workflow.",
        )

    return {
        "sent": True,
        "message": f"A password reset OTP was sent to {email}.",
    }


@router.post("/forgot-password/send-otp")
def forgot_password_send_otp(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    return send_reset_otp(payload, db)


@router.post("/forgot-password/verify-otp")
def forgot_password_verify_otp(
    payload: ForgotPasswordVerifyRequest,
    db: Session = Depends(get_db),
):
    account = find_verified_student_by_email(db, str(payload.email))
    registration_number = account.registration_number.strip().upper()
    ensure_password_reset_table(db)
    record = db.execute(
        text(
            """
            SELECT otp_hash, expires_at, attempts
            FROM campusresolve_password_reset_otp
            WHERE registration_number = :registration_number
            """
        ),
        {"registration_number": registration_number},
    ).mappings().first()

    if not record:
        raise HTTPException(status_code=400, detail="OTP not found. Request a new code.")
    now = utc_now()
    if record["expires_at"] <= now:
        db.execute(
            text("DELETE FROM campusresolve_password_reset_otp WHERE registration_number = :registration_number"),
            {"registration_number": registration_number},
        )
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired. Request a new code.")
    if record["attempts"] >= 5:
        db.execute(
            text("DELETE FROM campusresolve_password_reset_otp WHERE registration_number = :registration_number"),
            {"registration_number": registration_number},
        )
        db.commit()
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new OTP.")

    expected = reset_digest(registration_number, "otp", payload.otp)
    if not hmac.compare_digest(expected, record["otp_hash"].strip()):
        attempts = record["attempts"] + 1
        if attempts >= 5:
            db.execute(
                text("DELETE FROM campusresolve_password_reset_otp WHERE registration_number = :registration_number"),
                {"registration_number": registration_number},
            )
        else:
            db.execute(
                text("UPDATE campusresolve_password_reset_otp SET attempts = :attempts WHERE registration_number = :registration_number"),
                {"attempts": attempts, "registration_number": registration_number},
            )
        db.commit()
        raise HTTPException(status_code=400, detail="Incorrect OTP. Please try again.")

    reset_token = secrets.token_urlsafe(32)
    db.execute(
        text(
            """
            UPDATE campusresolve_password_reset_otp
            SET verified_at = :verified_at,
                reset_token_hash = :reset_token_hash,
                reset_token_expires_at = :reset_token_expires_at
            WHERE registration_number = :registration_number
            """
        ),
        {
            "verified_at": now,
            "reset_token_hash": reset_digest(registration_number, "token", reset_token),
            "reset_token_expires_at": now + timedelta(minutes=10),
            "registration_number": registration_number,
        },
    )
    db.commit()
    return {"verified": True, "reset_token": reset_token, "message": "OTP verified. Set your new password."}


@router.post("/forgot-password/reset")
def forgot_password_reset(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    account = find_verified_student_by_email(db, str(payload.email))
    registration_number = account.registration_number.strip().upper()
    ensure_password_reset_table(db)
    record = db.execute(
        text(
            """
            SELECT reset_token_hash, reset_token_expires_at
            FROM campusresolve_password_reset_otp
            WHERE registration_number = :registration_number
              AND verified_at IS NOT NULL
            """
        ),
        {"registration_number": registration_number},
    ).mappings().first()

    if (
        not record
        or not record["reset_token_hash"]
        or not record["reset_token_expires_at"]
        or record["reset_token_expires_at"] <= utc_now()
    ):
        raise HTTPException(status_code=400, detail="Password reset session expired. Request a new OTP.")

    expected = reset_digest(registration_number, "token", payload.reset_token)
    if not hmac.compare_digest(expected, record["reset_token_hash"].strip()):
        raise HTTPException(status_code=400, detail="Invalid password reset session. Verify the OTP again.")

    account.password_hash = hash_password(payload.new_password)
    account.updated_at = utc_now()
    db.execute(
        text("DELETE FROM campusresolve_password_reset_otp WHERE registration_number = :registration_number"),
        {"registration_number": registration_number},
    )
    db.commit()
    return {"reset": True, "message": "Password updated successfully. Please sign in with your registration number and new password."}


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    password = payload.password.get_secret_value()
    category = None
    username = ""
    registration_number = None

    if payload.role == "Student":
        registration_number = (payload.registration_number or "").strip().upper()
        if not registration_number:
            raise HTTPException(status_code=400, detail="Registration number is required.")

        account = db.scalar(
            select(StudentAccount).where(
                StudentAccount.registration_number == registration_number
            )
        )
        if account and account.password_hash:
            valid_password = verify_password(password, account.password_hash)
        else:
            # Keep existing prototype users working until they reset their password.
            valid_password = secrets.compare_digest(password.strip().upper(), registration_number)

        if not valid_password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid registration number or password.",
            )
        username = registration_number

    elif payload.role == "Admin":
        admin_password = settings.admin_password.get_secret_value()
        if not settings.admin_username or not admin_password:
            raise HTTPException(
                status_code=503,
                detail="Admin credentials are not configured.",
            )

        valid = (
            payload.username is not None
            and secrets.compare_digest(payload.username, settings.admin_username)
            and secrets.compare_digest(password, admin_password)
        )
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Admin ID or Password.",
            )
        username = settings.admin_username

    else:
        if not payload.category:
            raise HTTPException(
                status_code=400,
                detail="Please select a staff category.",
            )

        expected_id, password_setting = STAFF_ACCOUNTS[payload.category]
        configured_password = getattr(settings, password_setting).get_secret_value()
        if not configured_password:
            raise HTTPException(
                status_code=503,
                detail="Staff password is not configured.",
            )

        valid = (
            payload.staff_id is not None
            and secrets.compare_digest(payload.staff_id, expected_id)
            and secrets.compare_digest(password, configured_password)
        )
        if not valid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Staff ID or Password.",
            )
        username = expected_id
        category = payload.category

    token = create_access_token(
        username=username,
        role=payload.role,
        category=category,
        registration_number=registration_number,
    )
    return LoginResponse(
        access_token=token,
        role=payload.role,
        username=username,
        category=category,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.")

    try:
        secret = settings.jwt_secret_key.get_secret_value()
        if not secret:
            raise HTTPException(
                status_code=503,
                detail="JWT secret is not configured.",
            )
        return jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
        )
    except JWTError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired authentication token.",
        )
