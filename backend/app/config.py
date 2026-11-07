
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://campusresolve:"
        "campusresolve_dev_password@localhost:5433/campusresolve"
    )

    campusresolve_department_email_academics: str = ""
    campusresolve_department_email_examinations: str = ""
    campusresolve_department_email_hostel: str = ""
    campusresolve_department_email_transport: str = ""
    campusresolve_department_email_administration: str = ""
    campusresolve_department_email_other: str = ""

    frontend_origin: str = "http://localhost:5173"
    app_env: str = "development"
    n8n_supervisor_webhook_url: str = (
        "http://localhost:5678/webhook/campusresolve/supervisor"
    )
    n8n_grievance_notifications_webhook_url: str = (
    "http://localhost:5678/webhook/campusresolve/grievance-notifications"
    )
    # Cloudinary image storage
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: SecretStr = SecretStr("")

    gmail_sender_email: str = ""
    gmail_app_password: SecretStr = SecretStr("")

    # Prototype login
    student_portal_password: SecretStr = SecretStr("")

    admin_username: str = ""
    admin_password: SecretStr = SecretStr("")

    staff_academics_password: SecretStr = SecretStr("")
    staff_examinations_password: SecretStr = SecretStr("")
    staff_hostel_password: SecretStr = SecretStr("")
    staff_transport_password: SecretStr = SecretStr("")
    staff_administration_password: SecretStr = SecretStr("")
    staff_other_password: SecretStr = SecretStr("")

    jwt_secret_key: SecretStr = SecretStr("")
    jwt_access_token_expire_minutes: int = 480

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()