# Pruebas aisladas de sensores y comunicación

Estos sketches son para diagnóstico de banco y no inicializan BLE ni motores.
Abre y carga solo uno a la vez en el módulo correspondiente.

## Nodo A — ADC

Abre `nodeA_sensor_test/nodeA_sensor_test.ino`. En el monitor serial USB usa
115200 baudios. Debe imprimir cada 250 ms:

```text
[A-TEST] flex=..., ..., ..., ..., ... emg=... fsr=... vbat_raw=...
```

Mueve cada sensor flex por separado y verifica que solo cambie el canal
correspondiente. No conectes el clutch durante esta prueba.

## Nodo B — UART A/C

Abre `nodeB_sensor_test/nodeB_sensor_test.ino`. B no habilita STBY, LEDC ni
motores; solo muestra los frames recibidos de A y C. Si A está conectado,
debe aparecer `flex=`; si C está conectado, debe aparecer `enc=`.

## Nodo C — encoders

Abre `nodeC_sensor_test/nodeC_sensor_test.ino`. Gira cada encoder lentamente y
comprueba el conteo con signo. La ISR no imprime; el monitor se actualiza cada
250 ms desde `loop()`.

Los pines de los tests incluyen los `pins.h` de sus nodos mediante rutas
relativas. Confirma el esquema del ESP32-S3-Zero antes de cablear.
