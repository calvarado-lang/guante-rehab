import { describe, expect, it } from 'vitest'
import { isWebBluetoothAvailable } from './browserSupport'

describe('compatibilidad del navegador', () => {
  it('devuelve false cuando Web Bluetooth no está disponible', () => {
    expect(isWebBluetoothAvailable()).toBe(false)
  })
})
