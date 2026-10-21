from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import database
from .models import HealthResponse
from .routes import router
from .settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    database.open()
    try:
        yield
    finally:
        database.close()


app = FastAPI(
    title='Guante Rehab API',
    description='API para sincronizar sesiones de rehabilitación con Neon.',
    version='1.0.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['Content-Type', 'X-Device-Id'],
)

app.include_router(router)


@app.get('/api/health', response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status='ok',
        database='connected' if database.is_ready else 'not_configured',
    )
