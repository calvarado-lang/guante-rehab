# Pruebas host

La lógica de `common/` no depende de Arduino. En una máquina con `g++`:

```bash
cd firmware/test
g++ -std=c++11 -Wall -Wextra -I../common test_host.cpp -o /tmp/guante_test_host
/tmp/guante_test_host
```

La prueba incluye calibración, CRC, parser byte a byte con un millón de bytes
de ruido, flapping de salud del `Supervisor`, wrap de contadores y límites de
la consola de banco.
