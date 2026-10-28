# Guante Rehab — firmware Fase 1 (banco)

Este directorio contiene una base de firmware para tres nodos:

- `nodeA`: sensores flex, EMG, FSR, batería, calibración NVS y actuador del clutch.
- `nodeB`: BLE + Wi-Fi, supervisión, motores, consola de banco y agregación de UART.
- `nodeC`: encoders y UART hacia B.

La fase 1 no implementa terapia, ley de control adaptativa ni movimiento de
motores por BLE/Wi-Fi. El único movimiento previsto es la consola de banco de
B, con límites estrictos y sin una persona conectada.

## Versiones

El código está escrito para:

| Herramienta | Versión objetivo | Estado en este workspace |
|---|---|---|
| arduino-cli | `3.x` de `esp32:esp32` | No verificado: no está instalado |
| arduino-esp32 | `3.x` | No verificado: falta instalación local |
| NimBLE-Arduino | `2.x` | No verificado: falta instalación local |
| Python | 3.x | Disponible |
| bleak | `2.0.0` | Disponible localmente; hardware no verificado |

No se inventa una versión exacta que no haya sido compilada. Después de
instalar las dependencias, anota las versiones reales aquí y en
`docs/OPEN_ISSUES.md`.

## Diagnóstico serial y tests de sensores

El firmware normal imprime diagnóstico USB cada 250 ms cuando
`GUANTE_SERIAL_DEBUG` está habilitado: A muestra `flex`, EMG, FSR y batería; B
muestra los flex/encoders recibidos; C muestra los encoders. Para probar sin
inicializar BLE o motores usa los sketches aislados de [`tests/`](tests/).

## Arduino IDE

1. Instala el paquete `esp32` de Espressif en una versión 3.x.
2. Instala `NimBLE-Arduino` 2.x desde el gestor de librerías. Wi-Fi usa las
   clases incluidas en el core de ESP32.
3. Ejecuta `tools/sync_common.sh` desde una terminal Bash, o copia los tres
   headers de `common/` a cada carpeta si Arduino IDE no los actualiza.
4. Abre un sketch por vez: `nodeA/nodeA.ino`, `nodeB/nodeB.ino` y
   `nodeC/nodeC.ino`.
5. Para A y B selecciona `ESP32S3 Dev Module`, activa `USB CDC On Boot` y
   `PSRAM = QSPI PSRAM`; para C selecciona un ESP32-C3 y activa `CDCOnBoot=cdc`.

En el ESP32-S3-Zero, el pin físico 3 es `3V3`, no `GPIO3`. El código usa
números GPIO explícitos; además deja libres GPIO19/20 para el USB nativo y
GPIO21 para el LED WS2812 integrado.

Los pines, frecuencia PWM, divisor de batería, sentido de encoder, timeouts y
passkey están marcados como provisionales. No conectes motores ni una persona
hasta revisar el esquema y `docs/SAFETY.md`.

## Arduino CLI

Con `arduino-cli` configurado y el core/librería instalados:

```bash
cd firmware
tools/sync_common.sh
arduino-cli compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc nodeA
arduino-cli compile --fqbn esp32:esp32:esp32s3:CDCOnBoot=cdc nodeB
arduino-cli compile --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc nodeC
```

`tools/build.sh` ejecuta los tres comandos. La salida de tamaño de flash/RAM
debe conservarse en el informe de banco; no está disponible todavía porque el
toolchain no está instalado en este workspace.

## Pruebas host

```bash
cd firmware/test
g++ -std=c++11 -Wall -Wextra -I../common test_host.cpp -o /tmp/guante_test_host
/tmp/guante_test_host
```

## Conexión Wi-Fi y BLE

`nodeB` mantiene los dos transportes disponibles. Por defecto, si
`GUANTE_WIFI_SSID` está vacío, crea el punto de acceso `Guante-Rehab` con la
contraseña de desarrollo `guante1234`; conecta el celular o tableta y usa
`http://192.168.4.1` en la PWA. Para una red existente, completa el SSID y la
contraseña en `nodeB/pins.h`.

La interfaz web envía `hello` por WebSocket en `/ws/telemetry`, recibe
telemetría JSON y usa `/device/health` para comprobar la dirección. El mismo
firmware sigue anunciando el servicio BLE para equipos compatibles.

## Cliente BLE de prueba

El cliente solo lee `status`, verifica los tamaños de sensores/motores y envía
`HEARTBEAT` cada 500 ms. No envía `START`, `STOP`, `ESTOP`, calibración ni
comandos de movimiento.

```bash
python -m pip install bleak
python firmware/tools/ble_client.py --name "Guante Rehab"
```

## Consola de banco de B

Con B conectado por USB:

```text
b 0,1 10 100
m 2 5 50
c
```

`b` es el comando nuevo para 2–5 motores; `m` conserva la forma de un motor.
El duty y la duración no pueden superar `BENCH_MAX_DUTY_PERCENT` y
`BENCH_MAX_MS`. Cualquier e-stop, pérdida de UART/sensores/encoders, batería
inválida, fallo de driver o `SAFE_STOP` detiene todos los motores.

## Límites conocidos

Este código no sustituye la validación eléctrica, mecánica, térmica ni clínica.
El límite físico de fuerza del dedo sigue sin resolver y es bloqueante para
personas. Ver `docs/OPEN_ISSUES.md`.
