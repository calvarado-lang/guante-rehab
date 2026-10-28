#!/usr/bin/env python3
"""Read-only BLE smoke test for Guante Rehab.

The only command this script writes is HEARTBEAT (0x0A, counter). It never
writes START, STOP, ESTOP, calibration, assist or mode commands.
"""

import argparse
import asyncio
import sys
from typing import Optional

try:
    from bleak import BleakClient, BleakScanner
except ImportError as exc:  # pragma: no cover - exercised by the user's environment
    print("Falta bleak. Instala con: python -m pip install bleak", file=sys.stderr)
    raise SystemExit(2) from exc

SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
SENSORS_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
MOTORS_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
STATUS_UUID = "6e400004-b5a3-f393-e0a9-e50e24dcca9e"
COMMAND_UUID = "6e400005-b5a3-f393-e0a9-e50e24dcca9e"


async def choose_device(address: Optional[str], name: Optional[str]):
    if address:
        return address
    devices = await BleakScanner.discover(timeout=8.0, return_adv=True)
    for device, advertisement in devices.values():
        advertised = {str(item).lower() for item in advertisement.service_uuids}
        if name and device.name != name:
            continue
        if name or SERVICE_UUID in advertised:
            return device.address
    return None


async def run(address: Optional[str], name: Optional[str]) -> None:
    target = await choose_device(address, name)
    if not target:
        raise RuntimeError("No encontré un dispositivo Guante Rehab")

    sensor_count = 0
    motor_count = 0
    packet_errors = []

    def on_sensors(_sender, data: bytearray) -> None:
        nonlocal sensor_count
        if len(data) != 18:
            packet_errors.append(f"sensores={len(data)}")
        else:
            sensor_count += 1

    def on_motors(_sender, data: bytearray) -> None:
        nonlocal motor_count
        if len(data) != 20:
            packet_errors.append(f"motores={len(data)}")
        else:
            motor_count += 1

    async with BleakClient(target) as client:
        status = await client.read_gatt_char(STATUS_UUID)
        if len(status) != 4:
            raise RuntimeError(f"status mide {len(status)} bytes, se esperaban 4")
        print(f"Conectado a {target}; status={bytes(status).hex()}")
        await client.start_notify(SENSORS_UUID, on_sensors)
        await client.start_notify(MOTORS_UUID, on_motors)
        counter = 0
        try:
            while True:
                # Deliberately the only BLE write in this program.
                await client.write_gatt_char(COMMAND_UUID, bytes((0x0A, counter)), response=False)
                counter = (counter + 1) & 0xFF
                await asyncio.sleep(0.5)
                if packet_errors:
                    raise RuntimeError("; ".join(packet_errors))
                print(f"heartbeat={counter:02x} sensores={sensor_count} motores={motor_count}")
        finally:
            await client.stop_notify(SENSORS_UUID)
            await client.stop_notify(MOTORS_UUID)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--address", help="Dirección BLE; si falta, escanea")
    parser.add_argument("--name", default="Guante Rehab", help="Nombre anunciado")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.address, args.name))
    except KeyboardInterrupt:
        print("\nPrueba detenida")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
