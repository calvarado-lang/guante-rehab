# Procedimiento de banco — Fase 1

Este procedimiento no autoriza conectar una persona. La fuerza física máxima
por dedo todavía no está resuelta.

## Antes de energizar

1. Revisar pines provisionales en los tres `pins.h` contra el esquema.
2. Mantener motores desconectados o montados en un banco sin posibilidad de
   atrapar dedos.
3. Confirmar que el clutch arranca suelto y que STBY está LOW.
4. Confirmar que la batería medida está dentro de los límites definidos.
5. Programar A, B y C por separado y abrir la consola USB de B.

## Pruebas sin movimiento

1. Confirmar anuncio BLE `Guante Rehab` y descubrir las cinco características.
2. Leer `status`; debe medir exactamente 4 bytes.
3. Usar `tools/ble_client.py`; debe observar sensores de 18 bytes y motores de
   20 bytes, enviando solamente heartbeat.
4. Verificar que sin calibración `CALIBRATED` está en cero y `START` no activa
   motores.
5. Ejecutar los cuatro comandos de calibración desde la herramienta de prueba
   que se defina para el banco y verificar persistencia tras reiniciar A.

## Consola de B

Formato: `b <motores separados por coma> <duty_percent> <milisegundos>`.

Ejemplo de bajo riesgo: `b 0,1 5 50`.

- `b` exige entre 2 y 5 motores.
- `m` conserva la prueba de un solo motor: `m 0 5 50`.
- El parser rechaza duty mayor que `BENCH_MAX_DUTY_PERCENT` o duración mayor
  que `BENCH_MAX_MS`.
- La salida se habilita solo después de que el clutch reporta el tiempo de
  asentamiento; STBY no sube antes.
- `c` intenta limpiar un `SAFE_STOP` solo si el paro físico está liberado y
  todos los health checks son válidos.

Ante cualquier condición insegura, comprobar que B ejecuta la cadena única:
STBY LOW/PWM cero, después clutch suelto, y todos los motores detenidos.

## Pérdida de comunicación

Desconectar BLE o dejar de enviar heartbeat. El estado debe pasar a
`SAFE_STOP`; recibir heartbeat de nuevo no debe reanudarlo automáticamente.
