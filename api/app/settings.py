from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
API_ROOT = Path(__file__).resolve().parents[1]

# Neon env pull writes the branch variables to the project root. Render and
# other hosts provide them through the process environment, which always wins.
for env_file in (
    PROJECT_ROOT / '.env.local',
    PROJECT_ROOT / '.env',
    API_ROOT / '.env.local',
    API_ROOT / '.env',
):
    load_dotenv(env_file, override=False)


def _read_origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in value.split(',') if origin.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    frontend_origins: tuple[str, ...]

    @classmethod
    def from_environment(cls) -> 'Settings':
        origins = os.getenv(
            'FRONTEND_ORIGINS',
            'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173',
        )
        return cls(
            database_url=os.getenv('DATABASE_URL') or None,
            frontend_origins=_read_origins(origins),
        )


settings = Settings.from_environment()
