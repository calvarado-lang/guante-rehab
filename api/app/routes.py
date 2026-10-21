from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from psycopg.types.json import Jsonb

from .database import database
from .models import SessionCreate, SessionRecord

router = APIRouter(prefix='/api')


def get_device_id(
    value: Annotated[str | None, Header(alias='X-Device-Id')] = None,
) -> str:
    device_id = (value or 'anonymous').strip()
    if not device_id or len(device_id) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='El identificador del dispositivo no es válido.',
        )
    return device_id


def require_database() -> None:
    if not database.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail='La API no tiene DATABASE_URL configurada.',
        )


def to_record(row: dict[str, object]) -> SessionRecord:
    return SessionRecord(
        id=int(row['id']),
        startedAt=int(row['started_at']),
        endedAt=int(row['ended_at']),
        durationMs=int(row['duration_ms']),
        mode=int(row['mode']),
        assistLevel=int(row['assist_level']),
        stats=row['stats'],  # type: ignore[arg-type]
        samples=row['samples'],  # type: ignore[arg-type]
    )


@router.post('/sessions', response_model=SessionRecord, status_code=status.HTTP_201_CREATED)
def create_session(
    session: SessionCreate,
    device_id: str = Depends(get_device_id),
    _: None = Depends(require_database),
) -> SessionRecord:
    with database.cursor() as (connection, cursor):
        cursor.execute(
            '''
            INSERT INTO sessions (
                device_id, started_at, ended_at, duration_ms, mode,
                assist_level, stats, samples
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, started_at, ended_at, duration_ms, mode,
                      assist_level, stats, samples
            ''',
            (
                device_id,
                session.startedAt,
                session.endedAt,
                session.durationMs,
                session.mode,
                session.assistLevel,
                Jsonb(session.stats.model_dump()),
                Jsonb([sample.model_dump() for sample in session.samples]),
            ),
        )
        row = cursor.fetchone()
        connection.commit()

    if row is None:
        raise HTTPException(status_code=500, detail='No se pudo guardar la sesión.')
    return to_record(row)


@router.get('/sessions', response_model=list[SessionRecord])
def list_sessions(
    device_id: str = Depends(get_device_id),
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    _: None = Depends(require_database),
) -> list[SessionRecord]:
    with database.cursor() as (_, cursor):
        cursor.execute(
            '''
            SELECT id, started_at, ended_at, duration_ms, mode,
                   assist_level, stats, samples
            FROM sessions
            WHERE device_id = %s
            ORDER BY started_at DESC
            LIMIT %s
            ''',
            (device_id, limit),
        )
        rows = cursor.fetchall()
    return [to_record(row) for row in rows]


@router.get('/sessions/{session_id}', response_model=SessionRecord)
def get_session(
    session_id: int,
    device_id: str = Depends(get_device_id),
    _: None = Depends(require_database),
) -> SessionRecord:
    with database.cursor() as (_, cursor):
        cursor.execute(
            '''
            SELECT id, started_at, ended_at, duration_ms, mode,
                   assist_level, stats, samples
            FROM sessions
            WHERE id = %s AND device_id = %s
            ''',
            (session_id, device_id),
        )
        row = cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail='Sesión no encontrada.')
    return to_record(row)
