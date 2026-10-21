# Guante Rehab — registro técnico actualizado

Fecha de actualización: 2026-10-21

## Estado del proyecto

La aplicación es una PWA Vite + React + TypeScript. El frontend funciona sin
backend y conserva el historial localmente con Dexie/IndexedDB.

## Trabajo realizado

- Se creó `api/` con un backend FastAPI.
- Se agregaron los endpoints:
  - `GET /api/health`
  - `POST /api/sessions`
  - `GET /api/sessions`
  - `GET /api/sessions/{id}`
- Se agregó el esquema PostgreSQL en `api/app/schema.sql`.
- Las estadísticas y muestras de cada sesión se guardan como `JSONB` en Neon.
- Se agregó validación para modo `0-4`, asistencia `0-100` y arreglos de cinco
  valores para flexión y rango de movimiento.
- Se agregó CORS configurable mediante `FRONTEND_ORIGINS`.
- Se agregó `X-Device-Id` para separar el historial anónimo de cada instalación.
- Se integró la PWA con la API mediante `src/api/sessions.ts`.
- Al terminar una sesión, primero se guarda localmente y después se intenta
  sincronizar con la API. Si la API no está disponible, la copia local sigue
  funcionando.
- El historial combina registros locales y remotos sin duplicarlos por fecha
  de inicio y fin.
- Se agregaron ejemplos de variables de entorno en `.env.example` y
  `api/.env.example`.
- Se agregó `render.yaml` con los dos servicios de Render y la regla rewrite
  para las rutas de React.
- Se documentó el despliegue separado de Static Site y Web Service en Render.

## Variables de entorno

Frontend:

```env
VITE_USE_MOCK=true
VITE_API_URL=https://tu-api.onrender.com
```

Backend:

```env
DATABASE_URL=postgresql://...neon.tech...?...sslmode=require
FRONTEND_ORIGINS=https://tu-pwa.onrender.com
```

`DATABASE_URL` solo debe existir en el backend. Nunca debe comenzar con
`VITE_` ni enviarse al navegador.

## Ejecución local

Frontend:

```bash
npm install
npm run dev
```

Backend, desde `api/`:

```bash
python -m venv .venv
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Para conectar ambos localmente, usa `VITE_API_URL=http://localhost:8000` y
configura `DATABASE_URL` con la conexión de desarrollo de Neon.

## Despliegue en Render

Static Site:

```text
Build: npm ci && npm run build
Publish directory: dist
```

Web Service:

```text
Root directory: api
Build: pip install -r requirements.txt
Start: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

En el Static Site agrega la regla rewrite `/*` → `/index.html` para las rutas
de React. En el Web Service agrega `DATABASE_URL` y `FRONTEND_ORIGINS`; en el
Static Site agrega `VITE_API_URL`.

## Seguridad y alcance

El identificador de dispositivo no es autenticación. Antes de usar datos de
pacientes o realizar una prueba clínica se deben agregar cuentas, autenticación,
autorización, auditoría y protección de datos. El backend actual es una base
funcional para desarrollo y demostración.
