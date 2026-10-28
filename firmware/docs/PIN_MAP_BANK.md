# Mapa de pines del banco

## Enlace C hacia B

```text
ESP32-C3 Mini GPIO8 TX  ->  ESP32-S3-Zero GPIO10 RX
GND comun
```

El enlace es unidireccional en esta fase. C no usa RX.

## Encoders del nodo C

```text
Encoder 1: A GPIO0  / B GPIO1
Encoder 2: A GPIO3  / B GPIO4
Encoder 3: A GPIO5  / B GPIO6
Encoder 4: A GPIO7  / B GPIO10
Encoder 5: A GPIO20 / B GPIO21
```

## Nodo B

```text
Motor 1 IN1 GPIO1  / IN2 GPIO2
Motor 2 IN1 GPIO4  / IN2 GPIO5
Motor 3 IN1 GPIO6  / IN2 GPIO7
Motor 4 IN1 GPIO8  / IN2 GPIO9
Motor 5 IN1 GPIO11 / IN2 GPIO13
STBY comun GPIO12
GPIO3 sin usar
RX desde C GPIO10
```

PWMA/PWMB estan conectados a 3.3 V. Por seguridad, el firmware principal
mantiene el driver deshabilitado y reporta `ERR_DRIVER`, ya que no puede
aplicar `BENCH_MAX_DUTY` sin una señal PWM controlable.

