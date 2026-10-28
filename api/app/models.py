from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SessionStats(BaseModel):
    emgAverage: float
    emgMaximum: float
    movementRange: list[float] = Field(min_length=5, max_length=5)
    lostPackets: int = Field(ge=0)


class SessionSample(BaseModel):
    timestamp: int
    flex: list[float] = Field(min_length=5, max_length=5)
    emgEnvelope: float
    fsr: float


class SessionCreate(BaseModel):
    profileId: UUID | None = None
    calibrationId: UUID | None = None
    routineId: UUID | None = None
    exerciseName: str | None = Field(default=None, max_length=160)
    startedAt: int
    endedAt: int
    durationMs: int = Field(ge=0)
    mode: int = Field(ge=0, le=4)
    assistLevel: int = Field(ge=0, le=100)
    stats: SessionStats
    samples: list[SessionSample]


class SessionRecord(SessionCreate):
    id: int


class ProfileCreate(BaseModel):
    id: UUID | None = None
    displayName: str = Field(min_length=1, max_length=160)
    patientCode: str = Field(min_length=1, max_length=64)


class ProfileRecord(ProfileCreate):
    id: UUID
    createdAt: int
    updatedAt: int


class CalibrationCreate(BaseModel):
    id: UUID | None = None
    flexionMin: list[float] = Field(min_length=5, max_length=5)
    flexionMax: list[float] = Field(min_length=5, max_length=5)
    movementRange: list[float] = Field(min_length=5, max_length=5)
    emgBaseline: float
    emgMvc: float
    sampleCount: int = Field(ge=0)
    notes: str | None = Field(default=None, max_length=1000)


class CalibrationRecord(CalibrationCreate):
    id: UUID
    profileId: UUID
    createdAt: int


class RoutineStep(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    mode: int = Field(ge=0, le=4)
    assistLevel: int = Field(ge=0, le=100)
    repetitions: int = Field(ge=1, le=100)
    restSeconds: int = Field(ge=0, le=600)
    targetMovementRange: list[float] = Field(min_length=5, max_length=5)


class RoutineCreate(BaseModel):
    id: UUID | None = None
    name: str = Field(min_length=1, max_length=160)
    targetMovementRange: list[float] = Field(min_length=5, max_length=5)
    mode: int = Field(ge=0, le=4)
    assistLevel: int = Field(ge=0, le=100)
    repetitions: int = Field(ge=1, le=100)
    restSeconds: int = Field(ge=0, le=600)
    steps: list[RoutineStep] = Field(min_length=1, max_length=20)
    status: Literal['proposed', 'approved', 'archived'] = 'proposed'


class RoutineRecord(RoutineCreate):
    id: UUID
    profileId: UUID
    createdAt: int


class RoutineRecommendation(BaseModel):
    profileId: UUID
    calibrationCount: int
    averageMovementRange: list[float] = Field(min_length=5, max_length=5)
    lastCalibrationAt: int | None
    suggestedMode: int = Field(ge=0, le=4)
    suggestedAssistLevel: int = Field(ge=0, le=100)
    suggestedRepetitions: int = Field(ge=1, le=100)
    suggestedRestSeconds: int = Field(ge=0, le=600)
    requiresApproval: bool


class HealthResponse(BaseModel):
    status: str
    database: str
