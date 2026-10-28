from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from psycopg.types.json import Jsonb

from .database import database
from .models import (
    CalibrationCreate,
    CalibrationRecord,
    ProfileCreate,
    ProfileRecord,
    RoutineCreate,
    RoutineRecommendation,
    RoutineRecord,
    SessionCreate,
    SessionRecord,
)

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


def require_profile(profile_id: UUID) -> None:
    with database.cursor() as (_, cursor):
        cursor.execute('SELECT 1 FROM profiles WHERE id = %s', (profile_id,))
        if cursor.fetchone() is None:
            raise HTTPException(status_code=404, detail='Perfil no encontrado.')


def to_profile(row: dict[str, object]) -> ProfileRecord:
    return ProfileRecord(
        id=row['id'],
        displayName=str(row['display_name']),
        patientCode=str(row['patient_code']),
        createdAt=int(row['created_at'].timestamp() * 1000),  # type: ignore[union-attr]
        updatedAt=int(row['updated_at'].timestamp() * 1000),  # type: ignore[union-attr]
    )


def to_calibration(row: dict[str, object]) -> CalibrationRecord:
    return CalibrationRecord(
        id=row['id'],
        profileId=row['profile_id'],
        flexionMin=row['flexion_min'],  # type: ignore[arg-type]
        flexionMax=row['flexion_max'],  # type: ignore[arg-type]
        movementRange=row['movement_range'],  # type: ignore[arg-type]
        emgBaseline=float(row['emg_baseline']),
        emgMvc=float(row['emg_mvc']),
        sampleCount=int(row['sample_count']),
        notes=row['notes'],  # type: ignore[arg-type]
        createdAt=int(row['created_at'].timestamp() * 1000),  # type: ignore[union-attr]
    )


def to_routine(row: dict[str, object]) -> RoutineRecord:
    return RoutineRecord(
        id=row['id'],
        profileId=row['profile_id'],
        name=str(row['name']),
        targetMovementRange=row['target_movement_range'],  # type: ignore[arg-type]
        mode=int(row['mode']),
        assistLevel=int(row['assist_level']),
        repetitions=int(row['repetitions']),
        restSeconds=int(row['rest_seconds']),
        steps=row['steps'],  # type: ignore[arg-type]
        status=str(row['status']),  # type: ignore[arg-type]
        createdAt=int(row['created_at'].timestamp() * 1000),  # type: ignore[union-attr]
    )


def to_session(row: dict[str, object]) -> SessionRecord:
    return SessionRecord(
        id=int(row['id']),
        profileId=row['profile_id'],  # type: ignore[arg-type]
        calibrationId=row['calibration_id'],  # type: ignore[arg-type]
        routineId=row['routine_id'],  # type: ignore[arg-type]
        exerciseName=row['exercise_name'],  # type: ignore[arg-type]
        startedAt=int(row['started_at']),
        endedAt=int(row['ended_at']),
        durationMs=int(row['duration_ms']),
        mode=int(row['mode']),
        assistLevel=int(row['assist_level']),
        stats=row['stats'],  # type: ignore[arg-type]
        samples=row['samples'],  # type: ignore[arg-type]
    )


@router.get('/profiles', response_model=list[ProfileRecord])
def list_profiles(
    _: None = Depends(require_database),
) -> list[ProfileRecord]:
    with database.cursor() as (_, cursor):
        cursor.execute('''
            SELECT id, display_name, patient_code, created_at, updated_at
            FROM profiles
            ORDER BY display_name ASC
        ''')
        rows = cursor.fetchall()
    return [to_profile(row) for row in rows]


@router.post('/profiles', response_model=ProfileRecord, status_code=status.HTTP_201_CREATED)
def create_profile(
    profile: ProfileCreate,
    _: None = Depends(require_database),
) -> ProfileRecord:
    profile_id = profile.id or uuid4()
    try:
        with database.cursor() as (connection, cursor):
            cursor.execute('''
                INSERT INTO profiles (id, display_name, patient_code)
                VALUES (%s, %s, %s)
                RETURNING id, display_name, patient_code, created_at, updated_at
            ''', (profile_id, profile.displayName.strip(), profile.patientCode.strip()))
            row = cursor.fetchone()
            connection.commit()
    except Exception as error:
        if 'patient_code' in str(error):
            raise HTTPException(status_code=409, detail='El código del perfil ya existe.') from error
        raise
    if row is None:
        raise HTTPException(status_code=500, detail='No se pudo guardar el perfil.')
    return to_profile(row)


@router.get('/profiles/{profile_id}/calibrations', response_model=list[CalibrationRecord])
def list_calibrations(
    profile_id: UUID,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    _: None = Depends(require_database),
) -> list[CalibrationRecord]:
    require_profile(profile_id)
    with database.cursor() as (_, cursor):
        cursor.execute('''
            SELECT id, profile_id, flexion_min, flexion_max, movement_range,
                   emg_baseline, emg_mvc, sample_count, notes, created_at
            FROM calibrations
            WHERE profile_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        ''', (profile_id, limit))
        rows = cursor.fetchall()
    return [to_calibration(row) for row in rows]


@router.post('/profiles/{profile_id}/calibrations', response_model=CalibrationRecord, status_code=status.HTTP_201_CREATED)
def create_calibration(
    profile_id: UUID,
    calibration: CalibrationCreate,
    _: None = Depends(require_database),
) -> CalibrationRecord:
    require_profile(profile_id)
    calibration_id = calibration.id or uuid4()
    with database.cursor() as (connection, cursor):
        cursor.execute('''
            INSERT INTO calibrations (
                id, profile_id, flexion_min, flexion_max, movement_range,
                emg_baseline, emg_mvc, sample_count, notes
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, profile_id, flexion_min, flexion_max, movement_range,
                      emg_baseline, emg_mvc, sample_count, notes, created_at
        ''', (
            calibration_id,
            profile_id,
            Jsonb(calibration.flexionMin),
            Jsonb(calibration.flexionMax),
            Jsonb(calibration.movementRange),
            calibration.emgBaseline,
            calibration.emgMvc,
            calibration.sampleCount,
            calibration.notes,
        ))
        row = cursor.fetchone()
        connection.commit()
    if row is None:
        raise HTTPException(status_code=500, detail='No se pudo guardar la calibración.')
    return to_calibration(row)


@router.get('/profiles/{profile_id}/routine-recommendation', response_model=RoutineRecommendation)
def recommend_routine(
    profile_id: UUID,
    _: None = Depends(require_database),
) -> RoutineRecommendation:
    require_profile(profile_id)
    with database.cursor() as (_, cursor):
        cursor.execute('''
            SELECT movement_range, created_at
            FROM calibrations
            WHERE profile_id = %s
            ORDER BY created_at DESC
            LIMIT 3
        ''', (profile_id,))
        rows = cursor.fetchall()

    if not rows:
        average_range = [0.0] * 5
        last_calibration_at = None
    else:
        values = [row['movement_range'] for row in rows]
        average_range = [
            round(sum(float(value[index]) for value in values) / len(values), 2)  # type: ignore[index]
            for index in range(5)
        ]
        last_calibration_at = int(rows[0]['created_at'].timestamp() * 1000)  # type: ignore[union-attr]

    return RoutineRecommendation(
        profileId=profile_id,
        calibrationCount=len(rows),
        averageMovementRange=average_range,
        lastCalibrationAt=last_calibration_at,
        suggestedMode=4,
        suggestedAssistLevel=50,
        suggestedRepetitions=5,
        suggestedRestSeconds=30,
        requiresApproval=True,
    )


@router.get('/profiles/{profile_id}/routines', response_model=list[RoutineRecord])
def list_routines(
    profile_id: UUID,
    _: None = Depends(require_database),
) -> list[RoutineRecord]:
    require_profile(profile_id)
    with database.cursor() as (_, cursor):
        cursor.execute('''
            SELECT id, profile_id, name, target_movement_range, mode,
                   assist_level, repetitions, rest_seconds, steps, status, created_at
            FROM routines
            WHERE profile_id = %s AND status <> 'archived'
            ORDER BY created_at DESC
        ''', (profile_id,))
        rows = cursor.fetchall()
    return [to_routine(row) for row in rows]


@router.post('/profiles/{profile_id}/routines', response_model=RoutineRecord, status_code=status.HTTP_201_CREATED)
def create_routine(
    profile_id: UUID,
    routine: RoutineCreate,
    _: None = Depends(require_database),
) -> RoutineRecord:
    require_profile(profile_id)
    routine_id = routine.id or uuid4()
    with database.cursor() as (connection, cursor):
        cursor.execute('''
            INSERT INTO routines (
                id, profile_id, name, target_movement_range, mode,
                assist_level, repetitions, rest_seconds, steps, status
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, profile_id, name, target_movement_range, mode,
                      assist_level, repetitions, rest_seconds, steps, status, created_at
        ''', (
            routine_id,
            profile_id,
            routine.name.strip(),
            Jsonb(routine.targetMovementRange),
            routine.mode,
            routine.assistLevel,
            routine.repetitions,
            routine.restSeconds,
            Jsonb([step.model_dump() for step in routine.steps]),
            routine.status,
        ))
        row = cursor.fetchone()
        connection.commit()
    if row is None:
        raise HTTPException(status_code=500, detail='No se pudo guardar la rutina.')
    return to_routine(row)


@router.post('/sessions', response_model=SessionRecord, status_code=status.HTTP_201_CREATED)
def create_session(
    session: SessionCreate,
    device_id: str = Depends(get_device_id),
    _: None = Depends(require_database),
) -> SessionRecord:
    if session.profileId is not None:
        require_profile(session.profileId)
    with database.cursor() as (connection, cursor):
        cursor.execute('''
            INSERT INTO sessions (
                device_id, profile_id, calibration_id, routine_id, exercise_name,
                started_at, ended_at, duration_ms, mode, assist_level, stats, samples
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, profile_id, calibration_id, routine_id, exercise_name,
                      started_at, ended_at, duration_ms, mode, assist_level,
                      stats, samples
        ''', (
            device_id,
            session.profileId,
            session.calibrationId,
            session.routineId,
            session.exerciseName,
            session.startedAt,
            session.endedAt,
            session.durationMs,
            session.mode,
            session.assistLevel,
            Jsonb(session.stats.model_dump()),
            Jsonb([sample.model_dump() for sample in session.samples]),
        ))
        row = cursor.fetchone()
        connection.commit()
    if row is None:
        raise HTTPException(status_code=500, detail='No se pudo guardar la sesión.')
    return to_session(row)


@router.get('/sessions', response_model=list[SessionRecord])
def list_sessions(
    device_id: str = Depends(get_device_id),
    profile_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    _: None = Depends(require_database),
) -> list[SessionRecord]:
    with database.cursor() as (_, cursor):
        if profile_id is None:
            cursor.execute('''
                SELECT id, profile_id, calibration_id, routine_id, exercise_name,
                       started_at, ended_at, duration_ms, mode, assist_level,
                       stats, samples
                FROM sessions
                WHERE device_id = %s
                ORDER BY started_at DESC
                LIMIT %s
            ''', (device_id, limit))
        else:
            cursor.execute('''
                SELECT id, profile_id, calibration_id, routine_id, exercise_name,
                       started_at, ended_at, duration_ms, mode, assist_level,
                       stats, samples
                FROM sessions
                WHERE device_id = %s AND profile_id = %s
                ORDER BY started_at DESC
                LIMIT %s
            ''', (device_id, profile_id, limit))
        rows = cursor.fetchall()
    return [to_session(row) for row in rows]


@router.get('/sessions/{session_id}', response_model=SessionRecord)
def get_session(
    session_id: int,
    device_id: str = Depends(get_device_id),
    _: None = Depends(require_database),
) -> SessionRecord:
    with database.cursor() as (_, cursor):
        cursor.execute('''
            SELECT id, profile_id, calibration_id, routine_id, exercise_name,
                   started_at, ended_at, duration_ms, mode, assist_level,
                   stats, samples
            FROM sessions
            WHERE id = %s AND device_id = %s
        ''', (session_id, device_id))
        row = cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail='Sesión no encontrada.')
    return to_session(row)
