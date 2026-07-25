"""
Library Management System — API entrypoint.

Run with:
    uvicorn app.main:app --reload --port 8000
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import auth, books, dashboard, issues, lookups, reports, students

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s")
logger = logging.getLogger("library.main")

settings = get_settings()

app = FastAPI(
    title="Library Management System API",
    description="Backend API for the Advanced Library Management System — "
                "MySQL-first design showcasing stored procedures, functions, "
                "triggers, views and transactional business logic.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(books.router)
app.include_router(students.router)
app.include_router(issues.router)
app.include_router(reports.router)
app.include_router(lookups.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "library-management-system"}
