from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .settings import settings


class Database:
    def __init__(self) -> None:
        self.pool: ConnectionPool | None = None

    @property
    def is_ready(self) -> bool:
        return self.pool is not None

    def open(self) -> None:
        if settings.database_url is None:
            return

        self.pool = ConnectionPool(
            conninfo=settings.database_url,
            min_size=1,
            max_size=5,
            timeout=10,
        )
        self.pool.open(wait=True)
        schema_path = Path(__file__).with_name('schema.sql')
        with self.pool.connection() as connection:
            connection.execute(schema_path.read_text(encoding='utf-8'))
            connection.commit()

    def close(self) -> None:
        if self.pool is not None:
            self.pool.close()
            self.pool = None

    @contextmanager
    def cursor(self) -> Iterator[tuple[Connection, object]]:
        if self.pool is None:
            raise RuntimeError('DATABASE_URL no está configurada.')

        with self.pool.connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                yield connection, cursor


database = Database()
