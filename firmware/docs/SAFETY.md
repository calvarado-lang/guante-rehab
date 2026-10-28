# Reglas de seguridad implementadas

- El clutch arranca suelto.
- En la parada, B pone STBY LOW y PWM cero antes de enviar a A la orden de
  soltar el clutch.
- STBY solo sube después de `CLUTCH_SETTLE_MS` en una prueba de banco válida.
- Los callbacks BLE y los eventos Wi-Fi solo encolan comandos; el control se
  despacha desde el ciclo principal.
- `START` no produce movimiento en Fase 1.
- `SAFE_STOP` queda latched: `STOP` no lo limpia y heartbeat posterior no lo
  reanuda.
- La recuperación USB `c` requiere paro físico liberado y health checks válidos.
- La ISR de encoder no usa Serial, memoria dinámica ni delay; usa contadores
  unsigned para que el wrap no tenga comportamiento indefinido.
- La batería inválida/vieja usa `VBAT_VALID_MAX_V` al calcular `dutyMax`; no se
  usa una batería baja como valor seguro falso.

El hardware debe agregar y verificar límites físicos de fuerza, corriente,
temperatura y recorrido antes de cualquier prueba con una persona.
