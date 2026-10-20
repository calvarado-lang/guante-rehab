# AGENTS.md — PWA del Guante Robótico de Rehabilitación Adaptativa

Instrucciones para el agente de código (Codex) que construirá la PWA. Lee este archivo completo antes de escribir código y trabaja **por fases**, en el orden indicado. Al terminar cada fase, verifica sus criterios de aceptación antes de pasar a la siguiente.

## 1. Contexto del proyecto

Proyecto de titulación (UABC, Facultad de Ingeniería): *"Diseño e implementación de un guante robótico con asistencia adaptativa para la rehabilitación de mano"*. Es un exoesqueleto de mano impreso en 3D, con motores DC + tendones, sensores flex por dedo, EMG, FSR y potenciómetros.

El sistema adapta la asistencia al esfuerzo del usuario: más asistencia cuando el esfuerzo (EMG) es bajo, más exigencia cuando es alto.

**Esta PWA es la interfaz** (configurar sesión, calibrar, ver datos en vivo, guardar historial). **No contiene el control adaptativo**: ese lazo vive en el firmware (ESP32-S3). La app nunca es la única protección de seguridad.

### Hardware (para entender los datos)

- Nodo A (ESP32-S3-Zero): sensores (flex ×5, EMG, FSR).
- Nodo B (ESP32-S3-Zero): motores (3× TB6612FNG, 5 motores DC N20) y control.
- Nodo C (ESP32-C3 mini): lee encoders A/B de los 5 motores y manda conteos por UART al Nodo B.
- Nodos A y B se comunican por UART cableado. Batería LiPo 2S con monitor por divisor resistivo a ADC.
- **Qué nodo expone BLE al celular está por confirmar.** La app no debe depender de eso: usa la capa de abstracción de la sección 5 y se configura con los UUID de `gattSpec.ts`.

## 2. Stack (obligatorio)

- Vite + React 18+ + **TypeScript en modo estricto**
- `vite-plugin-pwa` (manifest, service worker, instalable)
- Zustand para estado
- Dexie (IndexedDB) para datos locales
- uPlot para gráficas en vivo
- UI: Tailwind CSS + componentes propios simples (sin librerías pesadas)
- Vitest para pruebas unitarias
- ESLint + Prettier
- Web Bluetooth API nativa (`@types/web-bluetooth`), **sin librerías BLE de terceros**

**Idioma:** toda la interfaz, mensajes y comentarios en **español**. Nombres de código en inglés.

## 3. Limitaciones de plataforma (respétalas)

- Web Bluetooth solo funciona en Chrome/Edge (Android, Windows, macOS, Linux). **No funciona en iOS.** Muestra un aviso claro si `navigator.bluetooth` no existe.
- Requiere HTTPS (o `localhost` en desarrollo).
- `navigator.bluetooth.requestDevice()` solo puede llamarse desde un gesto del usuario (clic). Nunca al cargar la página.
- Web Bluetooth **no permite pedir el MTU**: el navegador lo negocia solo. Por eso cada paquete de notificación se diseña para caber en **≤ 20 bytes**.
- Si la pestaña pasa a segundo plano o se bloquea la pantalla, la conexión puede cortarse: maneja la reconexión y muestra el estado.

## 4. Estructura de carpetas

```
src/
  ble/
    gattSpec.ts        → UUIDs, opcodes y constantes del protocolo (única fuente de verdad)
    types.ts           → interfaz GloveTransport y tipos de paquetes
    parsers.ts         → DataView → objetos tipados (y encoders de comandos)
    webBluetoothClient.ts
    mockClient.ts      → simulador sin hardware (ver sección 6)
    reconnect.ts
  store/
    deviceStore.ts     → conexión, estado, batería, errores
    sessionStore.ts    → sesión activa, ejercicio, parámetros
    telemetryBuffer.ts → buffer circular FUERA de React
  db/
    schema.ts          → Dexie
    sessions.ts
  pages/
    Conectar.tsx
    Calibracion.tsx
    Sesion.tsx
    Historial.tsx
  components/
    LiveChart.tsx      → uPlot
    EmergencyStop.tsx  → siempre visible
    ConnectionBadge.tsx
    BatteryIndicator.tsx
  App.tsx
  main.tsx
tests/
  parsers.test.ts
```

## 5. Protocolo BLE (propuesta v1 — editable solo en `gattSpec.ts`)

Todos los enteros son **little-endian**. Los UUID de abajo son **marcadores de posición**; deben coincidir con el firmware. Cámbialos solo en `gattSpec.ts`.

Servicio: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`

| Característica | UUID | Propiedades | Contenido |
|---|---|---|---|
| `telemetry_sensors` | `...0002...` | Notify | 18 bytes (ver abajo) |
| `telemetry_motors` | `...0003...` | Notify | 20 bytes (ver abajo) |
| `status` | `...0004...` | Notify, Read | estado y errores |
| `command` | `...0005...` | Write (sin respuesta) | comandos |
| `config` | `...0006...` | Read, Write | calibración |

### `telemetry_sensors` (18 bytes, ~20-50 Hz)

| Offset | Tipo | Campo |
|---|---|---|
| 0 | u16 | `seq` (contador, para detectar pérdidas) |
| 2 | u16 ×5 | `flex[0..4]` (pulgar→meñique, ADC crudo) |
| 12 | u16 | `emgEnvelope` |
| 14 | u16 | `fsr` |
| 16 | u8 | `state` (enum de máquina de estados) |
| 17 | u8 | `batteryPct` (0-100) |

### `telemetry_motors` (20 bytes, ~20 Hz)

| Offset | Tipo | Campo |
|---|---|---|
| 0 | i32 ×5 | `encoderCounts[0..4]` |

### `status` (4 bytes)

| Offset | Tipo | Campo |
|---|---|---|
| 0 | u8 | `state` |
| 1 | u8 | `errorCode` (0 = sin error) |
| 2 | u16 | `flags` (bit0: calibrado, bit1: EMG ok, bit2: motores habilitados, bit3: batería baja) |

### `command` (opcode u8 + payload)

| Opcode | Nombre | Payload |
|---|---|---|
| 0x01 | `SET_MODE` | u8 modo (0 idle, 1 calibrar, 2 pasivo, 3 asistido, 4 adaptativo) |
| 0x02 | `SET_ASSIST_LEVEL` | u8 (0-100) |
| 0x03 | `START` | — |
| 0x04 | `STOP` | — |
| 0x05 | `ESTOP` | — |
| 0x06 | `CAL_EMG_BASELINE` | — |
| 0x07 | `CAL_EMG_MVC` | — |
| 0x08 | `CAL_FLEX_OPEN` | — |
| 0x09 | `CAL_FLEX_CLOSED` | — |
| 0x0A | `HEARTBEAT` | u8 contador |

### Reglas de seguridad del protocolo (la app debe cumplirlas)

1. Envía `HEARTBEAT` cada **500 ms** mientras haya sesión activa. El firmware debe pasar a estado seguro si lo pierde.
2. El botón **Paro de emergencia** envía `ESTOP` de inmediato, está visible en toda pantalla de sesión y nunca se deshabilita.
3. Si la conexión se cae, la app muestra una alerta clara y **no asume** que el guante se detuvo: indica que el firmware debe entrar solo en estado seguro.
4. La app nunca envía niveles de asistencia fuera de 0-100 ni inicia sesiones sin calibración completa.

## 6. Modo simulador (clave para avanzar sin hardware)

Implementa `GloveTransport` como interfaz y dos implementaciones: `WebBluetoothClient` y `MockClient`.

```ts
interface GloveTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onSensors(cb: (p: SensorPacket) => void): () => void;
  onMotors(cb: (p: MotorPacket) => void): () => void;
  onStatus(cb: (s: StatusPacket) => void): () => void;
  onDisconnected(cb: () => void): () => void;
  sendCommand(cmd: Command): Promise<void>;
}
```

`MockClient` genera datos plausibles: flex que oscila suavemente, EMG con ráfagas, FSR con picos, encoders que cambian según el modo, batería que baja lento, y responde a comandos (`START`, `STOP`, `ESTOP`) cambiando el estado. Se elige con la variable `VITE_USE_MOCK=true` y con un interruptor visible en la pantalla Conectar.

## 7. Reglas de rendimiento y código

- **No guardes la telemetría de 20-50 Hz en el estado de React.** Usa `telemetryBuffer.ts` (buffer circular de tamaño fijo, fuera de React) y dibuja con uPlot a ~30 fps con `requestAnimationFrame`. React solo guarda estado de baja frecuencia (conexión, modo, batería, errores).
- Detecta paquetes perdidos con `seq` y cuéntalos en el store.
- Todo el parseo binario pasa por `parsers.ts` y tiene pruebas unitarias (valores límite, little-endian, longitudes incorrectas).
- Maneja `gattserverdisconnected` con reconexión (backoff, máximo 5 intentos) y estados visibles: `desconectado`, `conectando`, `conectado`, `reconectando`, `error`.
- Sin `any`. Sin dependencias innecesarias. Componentes pequeños.

## 8. Fases de trabajo

### Fase 1 — Base y PWA
Crear el proyecto Vite + React + TS, Tailwind, ESLint/Prettier, `vite-plugin-pwa` con manifest (nombre "Guante Rehab", íconos placeholder, `display: standalone`). Navegación entre las 4 pantallas (puede ser react-router).
**Aceptación:** `npm run build` pasa; la app es instalable; hay aviso si no existe Web Bluetooth.

### Fase 2 — Protocolo y simulador
`gattSpec.ts`, `types.ts`, `parsers.ts` (+ pruebas Vitest), `MockClient`, `telemetryBuffer.ts`, `deviceStore`.
**Aceptación:** `npm test` pasa; el mock emite paquetes y el store refleja conexión/estado.

### Fase 3 — Pantalla Conectar y cliente real
`WebBluetoothClient` con `requestDevice` (filtro por UUID de servicio), notificaciones, escritura de comandos y reconexión. Pantalla Conectar con interruptor mock/real, badge de conexión y batería.
**Aceptación:** con el mock funciona completo; con hardware real se conecta y recibe notificaciones (se puede probar con una app como nRF Connect simulando el servicio).

### Fase 4 — Pantalla Sesión
Gráficas en vivo (5 flex, EMG, FSR; encoders en vista secundaria), selector de modo, deslizador de nivel de asistencia (0-100), Start/Stop, **paro de emergencia siempre visible**, heartbeat de 500 ms, alerta de desconexión.
**Aceptación:** 30 fps estables con el mock a 50 Hz; el ESTOP envía el comando y pone la UI en estado de paro; sin re-renders de React por cada paquete.

### Fase 5 — Calibración
Flujo guiado paso a paso: EMG baseline (mano relajada), EMG MVC (contracción máxima), flex abierto y flex cerrado. Cada paso envía su comando, muestra progreso y confirma por `status.flags`. Bloquea el inicio de sesión si la calibración está incompleta.
**Aceptación:** el flujo completo funciona con el mock y los pasos se pueden repetir.

### Fase 6 — Historial local
Guardar sesiones en Dexie: fecha, duración, modo, nivel de asistencia, estadísticas (EMG promedio/máximo, rango de movimiento por dedo, paquetes perdidos) y una serie submuestreada para graficar. Pantalla Historial con lista, detalle y gráfica; exportar sesión a CSV.
**Aceptación:** las sesiones persisten al recargar y se exportan correctamente.

### Fase 7 — Pulido
Estados vacíos, errores legibles, accesibilidad (contraste, botones grandes para uso con pacientes), modo claro/oscuro, README con instrucciones de ejecución y de conexión con el firmware.

### Fuera de alcance por ahora
Sincronización con backend (FastAPI/Neon), cuentas de usuario, soporte iOS y app nativa. Deja la capa `db/sessions.ts` limpia para poder agregar sincronización después.

## 9. Reglas de trabajo para el agente

- Haz commits pequeños por fase con mensajes claros en español.
- No cambies el protocolo fuera de `gattSpec.ts` y `parsers.ts`; si algo del protocolo debe cambiar, documenta el cambio en el README.
- Si una decisión depende del hardware o del firmware (qué nodo expone BLE, UUID reales, frecuencias), **no la inventes**: usa el valor propuesto aquí, déjalo configurable y anótalo en una sección "Pendientes con firmware" del README.
- Antes de terminar cada fase, ejecuta `npm run lint`, `npm test` y `npm run build`.
