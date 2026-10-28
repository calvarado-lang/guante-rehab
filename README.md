# Guante Rehab

PWA en español para configurar, calibrar y monitorear un guante robótico de
rehabilitación adaptativa. La aplicación es la interfaz del sistema; el lazo
de control adaptativo y las protecciones críticas viven en el firmware del
ESP32-S3.

## Requisitos

- Node.js 22 o superior.
- Un navegador moderno en el celular, tableta o computadora.
- Chrome o Edge si se desea usar Bluetooth desde la PWA.
- Wi-Fi y la PWA en la misma red para usar el transporte Wi-Fi.

## Ejecución local

```bash
npm install
npm run dev
```

Para trabajar sin hardware, crea un archivo `.env.local` con:

```env
VITE_USE_MOCK=true
```

En **Conectar** se puede elegir simulador, Wi-Fi o Bluetooth. Para Wi-Fi,
escribe la IP del Nodo B (por ejemplo `http://192.168.4.1` en modo punto de
acceso). Para Bluetooth, la llamada de selección del dispositivo solo ocurre
al pulsar el botón de conexión, como exige Web Bluetooth.

La PWA puede abrirse en un celular o tableta desde el navegador. Wi-Fi es la
opción más compatible entre dispositivos; Web Bluetooth depende del navegador
y del sistema operativo. Si la PWA está publicada con HTTPS, el navegador
puede bloquear una conexión `http://` al guante por contenido mixto. En ese
caso usa HTTPS también en el dispositivo o sirve la PWA localmente por HTTP.

## Comandos de calidad

```bash
npm run lint
npm test
npm run build
```

La build genera el manifest y el service worker de la PWA. Los datos del
historial se guardan localmente en IndexedDB mediante Dexie.

La aplicación organiza el trabajo por perfil: cada perfil conserva su
historial de calibraciones, sesiones de ejercicio y propuestas de rutina. La
rutina se calcula como una referencia basada en las últimas calibraciones y
requiere aprobación antes de ejecutarse; el frontend todavía no envía
movimientos automáticos por dedo al firmware.

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

## Protocolo de conexión

La PWA conserva dos transportes para el mismo contrato de comandos y
telemetría: Web Bluetooth (`src/ble/webBluetoothClient.ts`) y Wi-Fi con HTTP
para salud más WebSocket para tiempo real (`src/wifi/wifiClient.ts`). La
aplicación envía heartbeat cada 500 ms durante una sesión, limita la asistencia
a 0–100, muestra el paro de emergencia y no inicia sin el flag de calibración.

## Firmware de banco

La implementacion inicial de los tres nodos ESP32 esta en [`firmware/`](firmware/).
Incluye la lógica portable, sketches para A/B/C, persistencia NVS de
calibración, consola de banco, pruebas host y clientes BLE/Wi-Fi. La fase 1 no
implementa terapia ni movimiento por BLE/Wi-Fi.

## Configuración Wi-Fi del firmware

En [`firmware/nodeB/pins.h`](firmware/nodeB/pins.h), deja `GUANTE_WIFI_SSID`
vacío para que el Nodo B cree el punto de acceso `Guante-Rehab`. Conecta el
celular o tableta a esa red y usa `http://192.168.4.1` en la PWA. Para integrar
el guante a la red existente, define `GUANTE_WIFI_SSID` y
`GUANTE_WIFI_PASSWORD`; luego usa la IP que muestre el monitor serial.

El firmware mantiene BLE disponible al mismo tiempo. El modo de conexión se
elige desde la pantalla **Conectar**.

## Pendientes con firmware

- Confirmar SSID, contraseña, IP y canal Wi-Fi definitivos del Nodo B.
- Sustituir los UUID marcadores por los UUID definitivos si el firmware usa
  otros valores; el cambio debe hacerse únicamente en `gattSpec.ts`.
- Confirmar las frecuencias reales de notificación y los códigos de estado.
- Confirmar el comportamiento exacto del firmware cuando pierde heartbeat o
  cualquiera de las conexiones BLE/Wi-Fi.
- Probar el servicio real con nRF Connect antes de una prueba clínica.

La aplicación nunca debe considerarse la única protección de seguridad: el
firmware debe entrar en estado seguro al perder heartbeat o comunicación.
