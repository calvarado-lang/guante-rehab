# Guante Rehab

PWA en español para configurar, calibrar y monitorear un guante robótico de
rehabilitación adaptativa. La aplicación es la interfaz del sistema; el lazo
de control adaptativo y las protecciones críticas viven en el firmware del
ESP32-S3.

## Requisitos

- Node.js 22 o superior.
- Chrome o Edge para Web Bluetooth.
- HTTPS en producción o `localhost` durante el desarrollo.

## Ejecución local

```bash
npm install
npm run dev
```

Para trabajar sin hardware, crea un archivo `.env.local` con:

```env
VITE_USE_MOCK=true
```

El interruptor visible en **Conectar** permite cambiar entre simulador y
Bluetooth real. La llamada de selección del dispositivo solo ocurre al pulsar
el botón de conexión, como exige Web Bluetooth.

## Comandos de calidad

```bash
npm run lint
npm test
npm run build
```

La build genera el manifest y el service worker de la PWA. Los datos del
historial se guardan localmente en IndexedDB mediante Dexie.

## Backend y Neon

El backend opcional está en [`api/`](api/). Usa FastAPI y PostgreSQL para
sincronizar sesiones con Neon. La PWA sigue funcionando sin backend con
IndexedDB; para activar la sincronización define `VITE_API_URL` en el entorno
de build, apuntando a la URL pública de la API.

Para desplegar en Render se necesitan dos servicios:

1. **Static Site** para la PWA: `npm ci && npm run build`, directorio publicado
   `dist`.
2. **Web Service** para la API: raíz `api`, instalación
   `pip install -r requirements.txt`, inicio
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

En el Web Service configura `DATABASE_URL` con la cadena de conexión de Neon y
`FRONTEND_ORIGINS` con el dominio del Static Site. En el Static Site configura
`VITE_API_URL` con el dominio del Web Service. No se deben poner credenciales
de Neon en variables `VITE_*` ni en el código del navegador.

Para las rutas de React agrega en Render una regla rewrite `/*` →
`/index.html`.

### Orden recomendado de despliegue

1. Sube este repositorio completo a GitHub. No subas `.env`, `api/.env`,
   `node_modules` ni `api/.venv`; están excluidos por `.gitignore`.
2. En Neon crea un proyecto PostgreSQL y copia la cadena de conexión desde
   **Connect**. Esa cadena se configura únicamente como `DATABASE_URL` en el
   Web Service de Render. El backend crea la tabla `sessions` al iniciar.
3. En Render selecciona **New → Blueprint**, conecta el repositorio de GitHub
   y usa el `render.yaml` que está en la raíz. Esto crea el Web Service de la
   API y el Static Site de la PWA.
4. En el Web Service configura `DATABASE_URL` y
   `FRONTEND_ORIGINS=https://<tu-static-site>.onrender.com`.
5. En el Static Site configura
   `VITE_API_URL=https://<tu-web-service>.onrender.com`.
6. Si todavía no usarás el guante físico, deja `VITE_USE_MOCK=true`. Para
   Bluetooth real usa `false` y abre la PWA en Chrome o Edge mediante HTTPS.

No necesitas subir el código fuente a Neon ni contratar otro hosting para la
PWA: GitHub almacena el código, Neon almacena PostgreSQL y Render ejecuta la
API y publica el frontend. Un dominio propio es opcional.

## Protocolo BLE

Los UUID, tamaños, opcodes y flags están centralizados en
[`src/ble/gattSpec.ts`](src/ble/gattSpec.ts). El parseo binario está en
[`src/ble/parsers.ts`](src/ble/parsers.ts) y usa little-endian. La aplicación
envía heartbeat cada 500 ms durante una sesión, limita la asistencia a 0–100,
muestra el paro de emergencia en la pantalla de sesión y no inicia sin el flag
de calibración.

## Pendientes con firmware

- Confirmar qué nodo expone BLE al celular.
- Sustituir los UUID marcadores por los UUID definitivos si el firmware usa
  otros valores; el cambio debe hacerse únicamente en `gattSpec.ts`.
- Confirmar las frecuencias reales de notificación y los códigos de estado.
- Confirmar el comportamiento exacto del firmware cuando pierde heartbeat o
  la conexión BLE.
- Probar el servicio real con nRF Connect antes de una prueba clínica.

La aplicación nunca debe considerarse la única protección de seguridad: el
firmware debe entrar en estado seguro al perder heartbeat o comunicación.
