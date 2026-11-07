from contextlib import asynccontextmanager
from app.api.supervisor import router as supervisor_router
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth
from app.config import settings
from app.database import Base, engine
from app import models  # noqa: F401 - registers SQLAlchemy models
from app.routers.grievances import router as grievances_router
from app.routers.feedback import router as feedback_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Convenient for the local prototype. Use migrations (Alembic) before production.
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="CampusResolve API",
    description="Local prototype API for the VFSTR AI student helpdesk and grievance workflow.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    settings.frontend_origin,
    "http://localhost:5174",
    "http://127.0.0.1:5174",
],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(grievances_router)
app.include_router(supervisor_router)
app.include_router(auth.router)
app.include_router(feedback_router)
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "campusresolve-api", "version": "0.1.0"}
