# UART interno

Todos los frames usan:

```text
A5 5A | type | length | payload[length] | crc16_le
```

El CRC es CRC-16/CCITT-FALSE (`0xFFFF`, polinomio `0x1021`) sobre `type`,
`length` y `payload`. El máximo de payload es 64 bytes. Todos los enteros son
little-endian.

| Type | Dirección | Payload |
|---:|---|---|
| `0x10` | A → B | 18 bytes BLE de sensores, calidad, error, flags y batería mV; total 24 |
| `0x11` | C → B | 20 bytes de cinco `int32` de encoder |
| `0x12` | B → A | opcode de calibración de 1 byte |
| `0x13` | B → A | clutch: `0` suelto, `1` acoplado |

El parser descarta frames con longitud inválida o CRC incorrecto y puede
alimentarse byte a byte.
