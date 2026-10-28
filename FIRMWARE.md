# Guante Rehab — contexto y especificación para firmware

Este documento contiene el contexto que necesita un agente de código para
implementar el firmware del guante robótico de rehabilitación adaptativa.

La PWA de este repositorio es únicamente la interfaz de usuario. El firmware
debe ser responsable del control de motores, la adaptación de asistencia, la
adquisición de sensores y todas las protecciones de seguridad. La aplicación
nunca debe considerarse la única protección del paciente.

## 1. Objetivo del sistema

El sistema es un exoesqueleto de mano impreso en 3D que ayuda al movimiento de
los cinco dedos mediante motores DC y tendones. Mide flexión, EMG, fuerza y
posición de motores. La asistencia se adapta al esfuerzo del usuario: el lazo
de control puede proporcionar más ayuda cuando el esfuerzo detectado es bajo y
reducirla cuando el usuario genera más esfuerzo.

La lógica adaptativa, los límites de fuerza, las rampas, los límites de
recorrido y la entrada a estado seguro pertenecen al firmware. La PWA solo
selecciona el modo, configura el nivel solicitado, inicia o detiene sesiones,
muestra telemetría y registra historial.

## 2. Hardware conocido

La arquitectura propuesta tiene tres nodos:

| Nodo | Función | Hardware/conexión |
|---|---|---|
| A | Adquisición de sensores | ESP32-S3-Zero; cinco sensores flex, EMG, FSR y batería |
| B | Motores y control | ESP32-S3-Zero; cinco motores DC N20, tres drivers TB6612FNG y lazo de control |
| C | Encoders | ESP32-C3 mini; lee canales A/B de los cinco motores y envía conteos por UART a B |

Conexiones conocidas:

- A y B se comunican por UART cableado.
- C envía los conteos de encoder a B por UART.
- La batería es LiPo 2S y se mide mediante divisor resistivo hacia un ADC.
- El nodo que expone BLE al teléfono todavía debe confirmarse. La opción
  recomendada es B, o un nodo controlador que pueda publicar la telemetría de
  A y C y recibir los comandos de control.
- Todos los niveles eléctricos, pines, polaridades, resistencias del divisor,
  relación de transmisión y límites mecánicos deben quedar en una configuración
  separada del código de control.

No inventar pines ni invertir el sentido de motores hasta verificar el esquema
eléctrico y el prototipo físico.

## 3. Contrato BLE actual con la PWA

Las definiciones fuente de verdad del lado web son:

- `src/ble/gattSpec.ts`
- `src/ble/parsers.ts`
- `src/ble/types.ts`
- `src/ble/webBluetoothClient.ts`

Los UUID actuales son marcadores de posición basados en Nordic UART Service y
deben coincidir con el firmware de prueba:

```text
Servicio:       6e400001-b5a3-f393-e0a9-e50e24dcca9e
Sensores:       6e400002-b5a3-f393-e0a9-e50e24dcca9e
Motores:        6e400003-b5a3-f393-e0a9-e50e24dcca9e
Estado:         6e400004-b5a3-f393-e0a9-e50e24dcca9e
Comandos:       6e400005-b5a3-f393-e0a9-e50e24dcca9e
Configuración:  6e400006-b5a3-f393-e0a9-e50e24dcca9e
```

Propiedades esperadas:

| Característica | Propiedades | Uso |
|---|---|---|
| `telemetry_sensors` | Notify | Paquete de sensores de 18 bytes |
| `telemetry_motors` | Notify | Paquete de encoders de 20 bytes |
| `status` | Notify, Read | Estado, error y flags de seguridad |
| `command` | Write Without Response | Comandos de la PWA |
| `config` | Read, Write | Reservada para parámetros/versionado/calibración futura |

Reglas BLE:

- Todos los enteros son little-endian.
- Cada paquete debe caber en una notificación BLE de máximo 20 bytes.
- La PWA no solicita ni configura MTU; el navegador negocia la conexión.
- No enviar paquetes de longitud variable en las características de telemetría.
- El firmware debe anunciar el servicio antes de aceptar una conexión.
- El teléfono puede desconectarse o perder la conexión; el firmware no debe
  confiar en que la PWA detectará primero la falla.

## 4. Paquetes binarios

### 4.1 `telemetry_sensors` — 18 bytes

La PWA interpreta exactamente este layout:

| Offset | Tamaño | Tipo | Campo |
|---:|---:|---|---|
| 0 | 2 | `uint16` LE | `seq`, contador de paquete |
| 2 | 2 | `uint16` LE | `flex[0]`, pulgar |
| 4 | 2 | `uint16` LE | `flex[1]`, índice |
| 6 | 2 | `uint16` LE | `flex[2]`, medio |
| 8 | 2 | `uint16` LE | `flex[3]`, anular |
| 10 | 2 | `uint16` LE | `flex[4]`, meñique |
| 12 | 2 | `uint16` LE | `emgEnvelope` |
| 14 | 2 | `uint16` LE | `fsr` |
| 16 | 1 | `uint8` | `state` |
| 17 | 1 | `uint8` | `batteryPct`, 0–100 |

`seq` debe incrementarse por cada paquete de sensores y envolver de `65535` a
`0`. La PWA calcula paquetes perdidos comparando el contador; no reutilizar el
contador para otro propósito.

Los valores de flexión, EMG y FSR se consideran lecturas crudas de ADC en el
contrato actual. El simulador usa un rango aproximado de 0–4095, pero la
resolución real del ADC y la escala física deben confirmarse. Si el firmware
aplica calibración, conservar una definición clara de si el valor publicado es
crudo, normalizado o convertido a unidades físicas.

### 4.2 `telemetry_motors` — 20 bytes

| Offset | Tamaño | Tipo | Campo |
|---:|---:|---|---|
| 0 | 4 | `int32` LE | `encoderCounts[0]` |
| 4 | 4 | `int32` LE | `encoderCounts[1]` |
| 8 | 4 | `int32` LE | `encoderCounts[2]` |
| 12 | 4 | `int32` LE | `encoderCounts[3]` |
| 16 | 4 | `int32` LE | `encoderCounts[4]` |

El orden debe ser pulgar, índice, medio, anular y meñique. Los conteos deben
ser acumulativos y con signo, salvo que el hardware requiera otra convención.
Documentar la dirección positiva por motor.

### 4.3 `status` — 4 bytes

| Offset | Tamaño | Tipo | Campo |
|---:|---:|---|---|
| 0 | 1 | `uint8` | `state` |
| 1 | 1 | `uint8` | `errorCode` |
| 2 | 2 | `uint16` LE | `flags` |

Enviar una notificación de estado al conectarse, después de cada cambio de
estado o error y cuando cambien los flags importantes. La característica debe
ser legible para que la PWA pueda consultar el estado inicial.

## 5. Estados y flags

Los valores usados por la PWA son:

| Valor | Estado | Significado |
|---:|---|---|
| 0 | `IDLE` | Reposo; motores deshabilitados |
| 1 | `CALIBRATING` | Ejecutando una rutina de calibración |
| 2 | `PASSIVE` | Movimiento pasivo o asistencia mínima según firmware |
| 3 | `ASSISTED` | Asistencia configurada por el usuario |
| 4 | `ADAPTIVE` | Lazo adaptativo activo |
| 5 | `SAFE_STOP` | Estado seguro por paro, falla o pérdida de comunicación |

Flags actuales:

| Bit | Máscara | Significado |
|---:|---:|---|
| 0 | `0x0001` | Calibración completa (`CALIBRATED`) |
| 1 | `0x0002` | EMG válido/listo (`EMG_OK`) |
| 2 | `0x0004` | Motores habilitados (`MOTORS_ENABLED`) |
| 3 | `0x0008` | Batería baja (`LOW_BATTERY`) |

Los bits no definidos deben enviarse en cero hasta que se documenten. La PWA
no inicia una sesión si `CALIBRATED` no está activo.

Transiciones mínimas esperadas:

1. Arranque → `IDLE`, con motores deshabilitados.
2. Cualquier comando de calibración válido → `CALIBRATING`.
3. Calibración completa y verificaciones correctas → `IDLE` con
   `CALIBRATED`; no habilitar motores automáticamente.
4. `START` solo se acepta si hay calibración completa, sensores válidos,
   batería suficiente y ningún error crítico.
5. `STOP` deshabilita motores y devuelve a `IDLE`.
6. `ESTOP`, timeout de heartbeat, desconexión BLE, pérdida de sensores,
   sobrecorriente, sobretemperatura o límite mecánico → `SAFE_STOP`.
7. Desde `SAFE_STOP` no se debe reanudar automáticamente. Requerir una acción
   explícita y segura, y preferentemente inspección física o reinicio controlado.

## 6. Comandos BLE

Todos los comandos se escriben en `command` con `Write Without Response`.

| Opcode | Comando | Bytes adicionales | Validación |
|---:|---|---|---|
| `0x01` | `SET_MODE` | 1 byte: modo | Solo 0–4 |
| `0x02` | `SET_ASSIST_LEVEL` | 1 byte: nivel | Entero 0–100 |
| `0x03` | `START` | Ninguno | Requiere calibración y estado seguro |
| `0x04` | `STOP` | Ninguno | Siempre debe deshabilitar motores |
| `0x05` | `ESTOP` | Ninguno | Debe tener prioridad máxima |
| `0x06` | `CAL_EMG_BASELINE` | Ninguno | Inicia medición de reposo EMG |
| `0x07` | `CAL_EMG_MVC` | Ninguno | Inicia medición de MVC EMG |
| `0x08` | `CAL_FLEX_OPEN` | Ninguno | Guarda postura abierta |
| `0x09` | `CAL_FLEX_CLOSED` | Ninguno | Guarda postura cerrada |
| `0x0A` | `HEARTBEAT` | 1 byte: contador | Contador modulo 256 |

Ejemplos de bytes:

```text
SET_MODE adaptativo:       01 04
SET_ASSIST_LEVEL 50:       02 32
START:                     03
STOP:                      04
ESTOP:                     05
CAL_EMG_BASELINE:          06
CAL_EMG_MVC:               07
CAL_FLEX_OPEN:             08
CAL_FLEX_CLOSED:           09
HEARTBEAT contador 7:      0A 07
```

El firmware debe validar longitud y rango de cada comando. Un comando inválido
no debe mover motores; debe publicar un `errorCode` y conservar o pasar a un
estado seguro según la gravedad.

No existe una característica de ACK separada en el contrato actual. El
resultado de un comando se comunica mediante `status`, cambios de telemetría y
`errorCode`. Si el firmware necesita ACK explícito, debe proponerse una
extensión compatible antes de cambiar los paquetes que ya consume la PWA.

## 7. Heartbeat y seguridad de comunicación

La PWA envía `HEARTBEAT` cada 500 ms mientras existe una sesión activa. El
firmware debe implementar un watchdog independiente de la aplicación:

- Reiniciar el temporizador al recibir un heartbeat válido.
- Si vence el timeout, detener motores inmediatamente, deshabilitar el puente
  de potencia y publicar `SAFE_STOP` cuando sea posible.
- El timeout debe ser mayor que 500 ms para tolerar jitter, pero suficientemente
  corto para limitar el movimiento sin supervisión. Proponer un valor inicial
  configurable, por ejemplo 1000–1500 ms, y validarlo en pruebas con pérdida de
  conexión.
- No asumir que una desconexión GATT llega al teléfono ni que la PWA puede
  enviar un último comando.
- El watchdog de comunicación debe seguir funcionando aunque una tarea de BLE,
  UART o adquisición se bloquee.
- Tras una pérdida de heartbeat no reanudar automáticamente cuando vuelvan los
  paquetes; exigir una secuencia explícita y segura.

Además del heartbeat, implementar protecciones independientes:

- límite de corriente por motor;
- límite de temperatura de drivers y MCU si hay sensores disponibles;
- límites de posición/recorrido de cada dedo;
- rampas de aceleración y desaceleración;
- detección de sensor desconectado o saturado;
- batería baja y batería críticamente baja;
- paro físico de emergencia si el hardware lo incluye;
- salida de potencia deshabilitada durante boot, calibración inválida y errores.

## 8. Calibración

La calibración completa requiere las cuatro operaciones siguientes:

1. `CAL_EMG_BASELINE`: medir EMG en reposo durante una ventana estable.
2. `CAL_EMG_MVC`: medir la contracción voluntaria máxima bajo un procedimiento
   controlado.
3. `CAL_FLEX_OPEN`: guardar la lectura abierta de los cinco sensores flex.
4. `CAL_FLEX_CLOSED`: guardar la lectura cerrada de los cinco sensores flex.

Requisitos:

- No declarar `CALIBRATED` hasta completar las cuatro rutinas y validar sus
  rangos.
- Rechazar calibraciones con ruido excesivo, valores saturados, sensores
  desconectados o relación abierta/cerrada inválida.
- Guardar parámetros en NVS/flash con versión, checksum y valores por dedo.
- Tener valores por defecto seguros si la memoria está vacía o corrupta.
- No accionar motores peligrosamente durante calibración. Si se requiere
  movimiento, usar velocidad, fuerza y recorrido limitados.
- Publicar `CALIBRATING`, progreso o error mediante `status`. El contrato actual
  no tiene un campo de progreso; puede expresarse con cambios de estado y
  `errorCode`, o proponerse una extensión en `config`.
- Permitir invalidar la calibración después de detectar cambio de sensor,
  reinicio de hardware relevante o una condición que vuelva insegura la
  asistencia.

## 9. Control de asistencia

La PWA envía un modo y un nivel de asistencia, pero no controla directamente
PWM ni corriente.

Modos recibidos:

```text
0 = reposo
1 = calibración
2 = pasivo
3 = asistido
4 = adaptativo
```

El nivel `0–100` es una solicitud limitada por el firmware. El firmware debe
aplicar límites físicos y clínicos propios aunque la PWA envíe un valor válido.
No permitir que el modo adaptativo incremente la fuerza sin límites máximos
configurados.

El lazo adaptativo debe documentar al menos:

- señal de esfuerzo utilizada y su filtrado;
- umbrales de EMG y comportamiento ante EMG inválido;
- cómo se traduce el esfuerzo a asistencia;
- límites por dedo y límites globales;
- frecuencia de control;
- rampas y anti-windup si se usa PID;
- qué sucede cuando el usuario resiste, deja de moverse o aparece una lectura
  incoherente.

No poner el algoritmo adaptativo en la PWA. La PWA solo es un cliente de
configuración y monitoreo.

## 10. Frecuencias y rendimiento

Valores objetivo del contrato actual:

- Sensores: una notificación cada 20 ms, aproximadamente 50 Hz.
- Motores/encoders: aproximadamente 20–25 Hz; el simulador publica cada 40 ms.
- Heartbeat: cada 500 ms desde la PWA durante una sesión.
- Estado: al conectar y ante cambios, errores o flags relevantes.

El firmware puede usar frecuencias internas mayores, pero no debe saturar BLE.
La adquisición y el control no deben depender del intervalo de notificación; BLE
solo transporta una muestra seleccionada.

Recomendaciones de implementación:

- Separar tareas de adquisición, control, BLE, UART y supervisión.
- No ejecutar control de motores dentro de callbacks de BLE.
- No hacer operaciones bloqueantes largas en callbacks de notificación.
- Usar buffers de tamaño fijo y controlar desbordamientos.
- Alimentar el watchdog de hardware desde una tarea supervisora, no desde cada
  tarea sin verificar el estado de las demás.
- Registrar eventos de fallo con código y causa, pero no depender de logs para
  la seguridad.

## 11. UART interno pendiente de definir

El frontend no conoce el protocolo UART entre nodos. El firmware debe diseñar
y documentar un protocolo interno antes de integrar A, B y C.

Como mínimo debe incluir:

- delimitador o framing sin ambigüedad;
- versión de protocolo;
- tipo de mensaje y longitud;
- contador de secuencia;
- payload con endianess definido;
- CRC o checksum;
- timeout de recepción;
- respuesta ante CRC inválido, mensaje truncado o nodo ausente;
- estado seguro si B deja de recibir sensores de A o encoders de C.

Una posible división de responsabilidades es:

- A publica a B flex, EMG, FSR, batería, secuencia y calidad de sensores.
- C publica a B conteos de encoder, secuencia y estado de canales A/B.
- B ejecuta el control, supervisa A/C y es el candidato principal para BLE.
- B publica por BLE la vista consolidada que consume la PWA.

No fijar bytes de UART en la PWA: es un contrato interno del firmware y debe
quedar documentado en el repositorio del firmware.

## 12. Errores y diagnóstico

`errorCode` es un `uint8` y actualmente la PWA solo muestra el número. Definir
una tabla estable en el firmware y documentarla. Una propuesta inicial, sujeta a
validación, es:

| Código | Significado sugerido |
|---:|---|
| 0 | Sin error |
| 1 | Comando inválido |
| 2 | No calibrado |
| 3 | Heartbeat perdido |
| 4 | Sensor flex inválido |
| 5 | EMG inválido |
| 6 | FSR inválido |
| 7 | Encoder o UART inválido |
| 8 | Sobrecorriente |
| 9 | Sobretemperatura |
| 10 | Batería críticamente baja |
| 11 | Límite mecánico |
| 12 | Falla de driver |
| 13 | Memoria/calibración corrupta |

Si se cambia esta tabla, actualizar también la documentación y, de ser útil,
los textos de la PWA.

## 13. Qué no debe hacer el firmware

- No enviar credenciales de Neon ni hablar directamente con Neon.
- No depender de la PWA para detener motores.
- No asumir que `START` implica que todo está seguro.
- No aceptar asistencia fuera de 0–100.
- No mover motores sin calibración y sensores válidos.
- No reanudar después de una pérdida de heartbeat sin una acción explícita.
- No cambiar UUID, longitudes o endianess sin actualizar el contrato web y las
  pruebas.
- No ocultar fallos de sensores, encoders, UART, batería o drivers.
- No usar datos clínicos reales sin autenticación, autorización, auditoría y
  protección de datos en la aplicación.

## 14. Pruebas mínimas de aceptación

Antes de conectar el guante a una persona, el firmware debe demostrar:

1. Anuncio del servicio y descubrimiento de todas las características con nRF
   Connect u otra herramienta BLE.
2. Paquetes de sensores exactamente de 18 bytes y motores exactamente de 20
   bytes.
3. Lectura little-endian correcta en todos los valores.
4. Contadores `seq` que incrementan y envuelven correctamente.
5. `status` legible al conectar y notificando cambios.
6. Validación de todos los opcodes y rechazo de bytes inválidos.
7. Los cuatro pasos de calibración y persistencia después de reiniciar.
8. Imposibilidad de iniciar sin `CALIBRATED`.
9. `ESTOP` inmediato y sin reanudación automática.
10. Entrada a `SAFE_STOP` si se desconecta BLE o se pierde heartbeat.
11. Entrada a `SAFE_STOP` ante pérdida de A, C, sensores, encoders o driver.
12. Batería baja y batería crítica con comportamiento seguro.
13. Límites de corriente, temperatura, posición y velocidad comprobados.
14. Prueba de ruido y valores extremos sin bloqueo del sistema.
15. Prueba de 30 minutos de telemetría sin desbordamiento ni pérdida de
    supervisión.

## 15. Entregables esperados de Claude

El agente que implemente el firmware debe entregar:

- código fuente organizado por adquisición, control, BLE, UART, seguridad y
  persistencia;
- definición de pines y configuración de hardware separada;
- implementación BLE compatible con este documento;
- protocolo UART documentado;
- tabla de errores y estados;
- rutinas de calibración persistentes y verificables;
- pruebas unitarias de empaquetado y parseo;
- pruebas de integración o scripts para nRF Connect/cliente BLE;
- instrucciones de compilación, flasheo, monitor serial y recuperación;
- lista explícita de supuestos y puntos que requieren medición en el prototipo;
- advertencia visible de que el firmware debe validarse primero sin una persona
  usando cargas y límites controlados.

## 16. Pendientes que deben confirmarse con el hardware

- Nodo exacto que expone BLE.
- UUID definitivos del firmware.
- Pines, polaridades y drivers reales.
- Resolución y referencia de ADC.
- Frecuencia efectiva de sensores y encoders.
- Relación encoder/motor/tendón y sentido positivo.
- Límites mecánicos por dedo.
- Corriente y temperatura máximas permitidas.
- Umbral de batería baja y batería crítica.
- Tiempo exacto de timeout de heartbeat.
- Procedimiento clínico de calibración EMG y MVC.
- Algoritmo adaptativo y sus límites clínicos.
- Protocolo UART entre A, B y C.
- Códigos finales de error y política de recuperación de `SAFE_STOP`.

Mientras estos puntos no estén confirmados, implementarlos como constantes
configurables y marcar cualquier valor provisional en la documentación del
firmware.
