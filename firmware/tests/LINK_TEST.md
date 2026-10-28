# Prueba de enlace A-B-C

Estos sketches son solo de diagnostico. No inicializan BLE, no habilitan STBY,
no configuran LEDC y no mueven motores.

## Carga

1. Carga `nodeA_sensor_test/nodeA_sensor_test.ino` en el nodo A.
2. Carga `nodeB_sensor_test/nodeB_sensor_test.ino` en el nodo B.
3. Carga `nodeC_sensor_test/nodeC_sensor_test.ino` en el nodo C.
4. Abre un monitor USB para cada placa a 115200 baudios.

El valor `flex` es ADC crudo de 12 bits: aproximadamente 0 a 4095. Ver
valores de 0 a casi 4000 es normal antes de calibrar.

## Cableado UART

Los numeros son GPIO, no posiciones fisicas del conector. Usa GND comun y
niveles de 3.3 V. Cruza TX con RX:

```text
A GPIO43 TX  ->  B GPIO44 RX
A GPIO44 RX  <-  B GPIO43 TX
C GPIO8 TX   ->  B GPIO10 RX
GND de A, B y C unidos
```

El enlace C hacia B es de un solo sentido en esta prueba; no hace falta
conectar un cable de regreso B hacia C. Para probar solo A hacia B basta
conectar A TX a B RX y GND.

El pin fisico 3 del ESP32-S3-Zero es 3V3, no GPIO3; no lo uses como senal.

## Mensajes esperados

En A:

```text
[A-LINK] TX seq=... flex=..., ..., ..., ..., ... emg=... fsr=...
```

En B:

```text
[B-LINK] RX A #... seq=... flex=...
[B-LINK] RX C #... enc=...
[B-LINK] A=OK C=OK
```

Si aparece `A=ESPERA`, revisa A TX hacia B RX y GND. Si aparece
`C=ESPERA`, revisa C TX hacia B RX y GND.

En C:

```text
[C-LINK] TX enc=...
```

Mueve un flex por vez y comprueba que cambia el canal correspondiente tanto
en A como en B. En C, los encoders de prueba son A/B: `0/1`, `3/4`, `5/6`,
`7/10`, `20/21`; el TX de C es GPIO8. No conectes clutch, drivers de motor
ni motores durante esta prueba.

