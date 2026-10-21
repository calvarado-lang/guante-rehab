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
    startedAt: int
    endedAt: int
    durationMs: int = Field(ge=0)
    mode: int = Field(ge=0, le=4)
    assistLevel: int = Field(ge=0, le=100)
    stats: SessionStats
    samples: list[SessionSample]


class SessionRecord(SessionCreate):
    id: int


class HealthResponse(BaseModel):
    status: str
    database: str
