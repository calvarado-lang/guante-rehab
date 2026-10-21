# Backend de Guante Rehab

API FastAPI para guardar sesiones en PostgreSQL de Neon.

## Ejecutar localmente

Desde la carpeta `api/`:

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

La API queda disponible en `http://localhost:8000` y la documentación en
`http://localhost:8000/docs`.

`DATABASE_URL` debe ser la cadena de conexión de Neon. Si se deja vacía, el
endpoint de salud funciona, pero las operaciones de sesiones responden con
`503`.

Si ejecutas `neon env pull` o `neon deploy`, Neon puede escribir
`DATABASE_URL` en el `.env.local` de la raíz del proyecto. El backend carga
ese archivo durante el desarrollo; en Render la variable del servicio tiene
prioridad y no se necesita ningún archivo local.

## Endpoints

- `GET /api/health`
- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/{id}`

El frontend envía `X-Device-Id` para separar el historial anónimo de cada
instalación. Esto no reemplaza un sistema de cuentas ni autenticación; antes
de usar datos clínicos se debe agregar autenticación y autorización.
