import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { telemetryBuffer, type TelemetryPoint } from '../store/telemetryBuffer'

export type ChartMetric = 'flex-0' | 'flex-1' | 'flex-2' | 'flex-3' | 'flex-4' | 'emg' | 'fsr' | 'motors'

interface LiveChartProps {
  title: string
  metric: ChartMetric
  height?: number
}

const flexLabels = ['Pulgar', 'Índice', 'Medio', 'Anular', 'Meñique']

function metricValue(point: TelemetryPoint, metric: ChartMetric): number | undefined {
  if (metric === 'motors') {
    return point.motors?.encoderCounts[0]
  }
  if (point.sensors === undefined) {
    return undefined
  }
  if (metric === 'emg') {
    return point.sensors.emgEnvelope
  }
  if (metric === 'fsr') {
    return point.sensors.fsr
  }
  return point.sensors.flex[Number(metric.slice(-1))]
}

function getChartData(metric: ChartMetric): uPlot.AlignedData {
  const points = telemetryBuffer.toArray()
    .map((point) => ({ point, value: metricValue(point, metric) }))
    .filter((entry): entry is { point: TelemetryPoint; value: number } => entry.value !== undefined)

  return [
    points.map(({ point }) => point.timestamp / 1000),
    points.map(({ value }) => value),
  ]
}

export function LiveChart({ title, metric, height = 220 }: LiveChartProps) {
  const chartElement = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chartElement.current === null) {
      return undefined
    }

    const chart = new uPlot({
      width: chartElement.current.clientWidth || 640,
      height,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false } },
      axes: [
        { stroke: '#94a3b8', grid: { stroke: '#e2e8f0', width: 1 } },
        { stroke: '#94a3b8', grid: { stroke: '#e2e8f0', width: 1 } },
      ],
      series: [
        {},
        { label: title, stroke: '#0f766e', width: 2, points: { show: false } },
      ],
    }, getChartData(metric), chartElement.current)

    let frame = 0
    const render = () => {
      chart.setData(getChartData(metric))
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(frame)
      chart.destroy()
    }
  }, [height, metric, title])

  return (
    <article className="card chart-card">
      <div className="chart-heading">
        <h3>{title}</h3>
        {metric.startsWith('flex-') && <span className="muted">{flexLabels[Number(metric.slice(-1))]}</span>}
      </div>
      <div ref={chartElement} className="live-chart" aria-label={`Gráfica de ${title}`} />
    </article>
  )
}
