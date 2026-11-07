from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Boolean,
    CheckConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Grievance(Base):
    __tablename__ = "grievances"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    ticket_code: Mapped[str] = mapped_column(
        String(24), unique=True, index=True, nullable=False
    )

    registration_number: Mapped[str] = mapped_column(
        String(30), index=True, nullable=False
    )

    student_name: Mapped[str] = mapped_column(
        String(120), nullable=False
    )

    student_email: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    subject: Mapped[str] = mapped_column(
        String(180), nullable=False
    )

    description: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    category: Mapped[str] = mapped_column(
        String(40), default="Other"
    )

    priority: Mapped[str] = mapped_column(
        String(20), default="Medium"
    )

    urgency: Mapped[str] = mapped_column(
        String(20), default="Normal"
    )

    status: Mapped[str] = mapped_column(
        String(30), default="Open"
    )

    assigned_department: Mapped[str] = mapped_column(
        String(120), default="Pending verification"
    )

    # Photo-based grievance fields

    submission_type: Mapped[str] = mapped_column(
        String(20),
        default="text",
        server_default="text",
        nullable=False
    )

    location: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    image_public_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    image_format: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    updates: Mapped[list["GrievanceUpdate"]] = relationship(
        back_populates="grievance",
        cascade="all, delete-orphan",
        order_by="GrievanceUpdate.created_at"
    )

    @property
    def has_image(self) -> bool:
        return bool(self.image_public_id)


class GrievanceUpdate(Base):
    __tablename__ = "grievance_updates"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    grievance_id: Mapped[int] = mapped_column(
        ForeignKey("grievances.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    status: Mapped[str] = mapped_column(
        String(30), nullable=False
    )

    update_note: Mapped[str] = mapped_column(
        Text, nullable=False
    )

    updated_by: Mapped[str] = mapped_column(
        String(120), default="System"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    grievance: Mapped["Grievance"] = relationship(
        back_populates="updates"
    )


class StudentFeedback(Base):
    __tablename__ = "student_feedback"

    __table_args__ = (
        CheckConstraint(
            "rating BETWEEN 1 AND 5",
            name="check_feedback_rating"
        ),
        CheckConstraint(
            "feedback_type IN ('AI_RESPONSE', 'GRIEVANCE_RESOLUTION')",
            name="check_feedback_type"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, index=True
    )

    registration_number: Mapped[str] = mapped_column(
        String(30), nullable=False, index=True
    )

    feedback_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )

    ticket_code: Mapped[str | None] = mapped_column(
        ForeignKey("grievances.ticket_code", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    query_text: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    rating: Mapped[int] = mapped_column(
        Integer, nullable=False
    )

    helpful: Mapped[bool | None] = mapped_column(
        Boolean, nullable=True
    )

    comments: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )