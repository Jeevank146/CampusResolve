from datetime import datetime, timedelta, timezone
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, SecretStr

from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)

Category = Literal[
    "Academics",
    "Examinations",
    "Hostel",
    "Transport",
    "Administration",
    "Other",
]


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


STAFF_ACCOUNTS = {
    "Academics": ("ACADEMICS_STAFF", "staff_academics_password"),
    "Examinations": ("EXAM_STAFF", "staff_examinations_password"),
    "Hostel": ("HOSTEL_STAFF", "staff_hostel_password"),
    "Transport": ("TRANSPORT_STAFF", "staff_transport_password"),
    "Administration": ("ADMIN_STAFF", "staff_administration_password"),
    "Other": ("OTHER_STAFF", "staff_other_password"),
}


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

    expires = datetime.now(timezone.utc) + timedelta(
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


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    password = payload.password.get_secret_value()
    category = None
    username = ""
    registration_number = None

    if payload.role == "Student":
        registration_number = (payload.registration_number or "").strip().upper()

        if not registration_number:
            raise HTTPException(
                status_code=400,
                detail="Registration number is required.",
            )

        # Prototype login rule: the student enters the same registration
        # number in both the Registration Number and Password fields.
        entered_password = password.strip().upper()
        if not secrets.compare_digest(entered_password, registration_number):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Password must match your registration number.",
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