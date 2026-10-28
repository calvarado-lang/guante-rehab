# Firmware — problemas abiertos y desviaciones

## No verificado en este entorno

- No se pudo ejecutar compilación real: `arduino-cli`, `g++` y `clang++` no
  están instalados en el workspace.
- No están verificadas las versiones exactas de `arduino-esp32 3.x` ni
  `NimBLE-Arduino 2.x`.
- La documentación oficial de NimBLE-Arduino 2.x confirma las firmas de
  `onConnect`/`onDisconnect`, `onWrite`, `getValue()` como `std::string` y las
  propiedades `WRITE_NR`, `READ_ENC` y `WRITE_ENC`; aun así no se pudo comprobar
  contra una instalación local.
- La documentación oficial de Arduino-ESP32 3.x confirma `ledcAttach`,
  `ledcWrite`, `ledcDetach` y `attachInterruptArg`; el comportamiento exacto
  de `pinMode` después de LEDC sigue pendiente de prueba en la placa.
- No se verificaron tamaños de flash/RAM ni warnings de los tres binarios.
- `tools/ble_client.py` pasa la comprobación sintáctica y `bleak 2.0.0` está
  instalado, pero no se probó contra hardware real.

## Desviaciones intencionales de FIRMWARE.md

- No existe `CLEAR_FAULT` en el contrato BLE actual. La recuperación explícita
  de `SAFE_STOP` se expone como `c` por la consola USB y exige que el paro
  físico no esté presionado; no se añadió un opcode BLE nuevo.
- `START` se rechaza en esta Fase 1 incluso con calibración válida: no hay ley
  de control ni movimiento terapéutico por BLE. El error se publica en
  `status` y la salida permanece deshabilitada.
- La calibración flex/EMG se guarda en NVS únicamente al completar los cuatro
  pasos. Una calibración parcial permanece en RAM hasta completar; un registro
  guardado con versión, magic o CRC inválido produce el error 13 y nunca activa
  `CALIBRATED`.
- El driver de corriente, temperatura y límites mecánicos físicos no puede
  implementarse sin sensores/señales definidos. No se inventan lecturas; el
  atasco por encoder queda como `ERR_STALL` reservado para la siguiente fase.

## Decisiones provisionales que siguen visibles

- Pines de A, B y C, UART, STBY, paro físico y señales de motores. En el
  ESP32-S3-Zero, el pin físico 3 es `3V3`; el código usa números GPIO, no
  números físicos de header, y no usa `GPIO3`. GPIO19/20 quedan reservados para
  el USB nativo; UART-C usa provisionalmente GPIO38/39, con GPIO39 compartido
  conceptualmente con JTAG.
- Frecuencia PWM de 20 kHz.
- Pulsos y pin del servo de clutch.
- Divisor, ganancia y umbrales de batería.
- Timeouts de heartbeat/UART y `CLUTCH_SETTLE_MS`.
- Sentido positivo de todos los encoders.
- `GUANTE_BLE_PASSKEY = 123456` es un valor de ejemplo y debe sustituirse
  antes de cualquier uso fuera de banco.
- El límite físico de fuerza por dedo sigue siendo bloqueante para personas.

## Cambios de API esperados al compilar

El código usa las APIs objetivo declaradas para Arduino-ESP32 3.x (`ledcAttach`,
`ledcWrite`, `attachInterruptArg`) y NimBLE-Arduino 2.x (`onWrite` con
`NimBLEConnInfo`, `notify`, seguridad y `WRITE_NR`). Si la versión instalada
requiere un equivalente, anotar aquí el nombre exacto, la versión y si cambió
algún comportamiento de seguridad antes de aceptar el binario.
