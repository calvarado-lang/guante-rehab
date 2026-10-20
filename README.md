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
