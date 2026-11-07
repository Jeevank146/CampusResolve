from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, EmailStr


Category = Literal[
    "Academics",
    "Examinations",
    "Hostel",
    "Transport",
    "Administration",
    "Other"
]

Priority = Literal["Low", "Medium", "High", "Critical"]
Urgency = Literal["Normal", "Urgent"]
Status = Literal["Open", "In Progress", "Resolved", "Closed"]


# Student grievance submission
class GrievanceCreate(BaseModel):
    registration_number: str = Field(min_length=3, max_length=30)
    student_name: str = Field(min_length=2, max_length=120)
    student_email: EmailStr
    subject: str = Field(min_length=4, max_length=180)
    description: str = Field(min_length=10, max_length=5000)


# Grievance status update
class GrievanceStatusUpdate(BaseModel):
    status: Status
    update_note: str = Field(min_length=3, max_length=1000)
    updated_by: str = Field(default="Staff", max_length=120)


# Individual grievance history
class GrievanceUpdateRead(BaseModel):
    id: int
    grievance_id: int
    status: str
    update_note: str
    updated_by: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Complete grievance response
class GrievanceRead(BaseModel):
    id: int
    ticket_code: str

    registration_number: str | None = None
    student_name: str
    student_email: str

    subject: str
    description: str
    category: str

    priority: str
    urgency: str

    status: str
    assigned_department: str

    # Photo grievance fields
    submission_type: str = "text"
    location: str | None = None
    has_image: bool = False
    image_url: str | None = None

    created_at: datetime
    updated_at: datetime

    updates: list[GrievanceUpdateRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Triage Agent output
class AIClassificationUpdate(BaseModel):
    category: Category
    priority: Priority
    urgency: Urgency
    reason: str = Field(min_length=1, max_length=2000)


# Routing Agent output
class DepartmentAssignmentUpdate(BaseModel):
    department: str = Field(min_length=2, max_length=120)
    reason: str = Field(min_length=1, max_length=2000)
