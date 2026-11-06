from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+psycopg://campusresolve:"
        "campusresolve_dev_password@localhost:5433/campusresolve"
    )
    frontend_origin: str = "http://localhost:5173"
    app_env: str = "development"
    n8n_supervisor_webhook_url: str = (
        "http://localhost:5678/webhook/campusresolve/supervisor"
    )

    gmail_sender_email: str = ""
    gmail_app_password: SecretStr = SecretStr("")

    # Prototype login: one shared password for student accounts.
    # Replace with university SSO/individual student credentials before deployment.
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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
