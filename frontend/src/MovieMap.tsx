import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Cluster, MapEdge, Movie, SimilarResult } from './types'

type Viewport = {
  scale: number
  x: number
  y: number
}

type ScreenPoint = {
  movie: Movie
  x: number
  y: number
}

const MIN_ZOOM = 0.7
const MAX_ZOOM = 12
const COLORS = ['#54705c', '#9a6b4f', '#596f91', '#8c6d8d', '#7d793f', '#397d7a', '#a15b5b', '#667c4f']

export function MovieMap({
  movies,
  clusters,
  edges,
  selected,
  selectedEdges,
  onSelect,
}: {
  movies: Movie[]
  clusters: Cluster[]
  edges: MapEdge[]
  selected: Movie | null
  selectedEdges: SimilarResult[]
  onSelect: (movie: Movie) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<Viewport>({ scale: 1, x: 0, y: 0 })
  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const gestureRef = useRef({ lastX: 0, lastY: 0, distance: 0, dragged: false })
  const screenPointsRef = useRef<ScreenPoint[]>([])
  const frameRef = useRef<number | null>(null)
  const animationRef = useRef<number | null>(null)
  const previousSelectedRef = useRef<number | null>(null)
  const [renderVersion, setRenderVersion] = useState(0)
  const [zoomPercent, setZoomPercent] = useState(100)

  const bounds = useMemo(() => {
    if (movies.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
    return movies.reduce(
      (result, movie) => ({
        minX: Math.min(result.minX, movie.x),
        maxX: Math.max(result.maxX, movie.x),
        minY: Math.min(result.minY, movie.y),
        maxY: Math.max(result.maxY, movie.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    )
  }, [movies])

  const broadClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === 1),
    [clusters],
  )
  const childClusters = useMemo(
    () => clusters.filter((cluster) => cluster.level === 2),
    [clusters],
  )
  const broadOrder = useMemo(
    () => new Map(broadClusters.map((cluster, index) => [cluster.id, index])),
    [broadClusters],
  )

  const scheduleDraw = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      setRenderVersion((version) => version + 1)
    })
  }, [])

  const updateViewport = useCallback((viewport: Viewport) => {
    viewportRef.current = viewport
    setZoomPercent(Math.round(viewport.scale * 100))
    scheduleDraw()
  }, [scheduleDraw])

  const zoomAt = useCallback((x: number, y: number, factor: number) => {
    const current = viewportRef.current
    const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.scale * factor))
    const ratio = scale / current.scale
    updateViewport({
      scale,
      x: x - (x - current.x) * ratio,
      y: y - (y - current.y) * ratio,
    })
  }, [updateViewport])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || movies.length === 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)

    const padding = 42
    const rangeX = bounds.maxX - bounds.minX || 1
    const rangeY = bounds.maxY - bounds.minY || 1
    const viewport = viewportRef.current
    const baseX = (x: number) => padding + ((x - bounds.minX) / rangeX) * (width - padding * 2)
    const baseY = (y: number) => padding + ((y - bounds.minY) / rangeY) * (height - padding * 2)
    const screenX = (x: number) => baseX(x) * viewport.scale + viewport.x
    const screenY = (y: number) => baseY(y) * viewport.scale + viewport.y
    const isVisible = (x: number, y: number, margin = 20) =>
      x >= -margin && x <= width + margin && y >= -margin && y <= height + margin

    const activeRegions = viewport.scale < 1.8 ? broadClusters : childClusters
    for (const cluster of activeRegions) {
      const x = screenX(cluster.x)
      const y = screenY(cluster.y)
      if (!isVisible(x, y, 160)) continue
      const parent = cluster.level === 1 ? cluster.id : cluster.parentId ?? 0
      const color = COLORS[(broadOrder.get(parent) ?? 0) % COLORS.length]
      const radius = Math.max(
        35,
        (cluster.radius / Math.max(rangeX, rangeY)) *
          Math.min(width, height) *
          viewport.scale *
          0.52,
      )
      context.beginPath()
      context.fillStyle = `${color}0b`
      context.strokeStyle = `${color}2b`
      context.lineWidth = cluster.level === 1 ? 1.2 : 0.8
      context.setLineDash(cluster.level === 1 ? [5, 7] : [3, 8])
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fill()
      context.stroke()
    }
    context.setLineDash([])

    const screenByID = new Map<number, { x: number; y: number }>()
    const visiblePoints: ScreenPoint[] = []
    for (const movie of movies) {
      const x = screenX(movie.x)
      const y = screenY(movie.y)
      screenByID.set(movie.id, { x, y })
      if (isVisible(x, y)) visiblePoints.push({ movie, x, y })
    }
    screenPointsRef.current = visiblePoints

    if (viewport.scale >= 1.45) {
      const stride = viewport.scale < 2.2 ? 3 : viewport.scale < 3.2 ? 2 : 1
      context.lineWidth = 0.65
      for (let index = 0; index < edges.length; index += stride) {
        const edge = edges[index]
        const source = screenByID.get(edge.source)
        const target = screenByID.get(edge.target)
        if (!source || !target || !isVisible(source.x, source.y) || !isVisible(target.x, target.y)) continue
        context.beginPath()
        context.strokeStyle = `rgba(84, 112, 92, ${Math.max(0.035, (edge.score - 0.25) * 0.16)})`
        context.moveTo(source.x, source.y)
        context.lineTo(target.x, target.y)
        context.stroke()
      }
    }

    if (selected) {
      const source = screenByID.get(selected.id)
      if (source) {
        context.lineWidth = 1.2
        for (const result of selectedEdges) {
          const target = screenByID.get(result.movie.id)
          if (!target) continue
          context.beginPath()
          context.strokeStyle = `rgba(217, 87, 43, ${0.18 + Math.max(0, result.score) * 0.55})`
          context.moveTo(source.x, source.y)
          context.lineTo(target.x, target.y)
          context.stroke()
        }
      }
    }

    for (const point of visiblePoints) {
      const isSelected = point.movie.id === selected?.id
      const isNeighbor = selectedEdges.some((result) => result.movie.id === point.movie.id)
      const colorIndex = broadOrder.get(point.movie.broadClusterId) ?? 0
      context.beginPath()
      context.fillStyle = isSelected
        ? '#e3572b'
        : isNeighbor
          ? '#e6a63f'
          : `${COLORS[colorIndex % COLORS.length]}${viewport.scale < 1.3 ? '7d' : 'a8'}`
      context.arc(
        point.x,
        point.y,
        isSelected ? 6.5 : isNeighbor ? 4 : Math.min(3.2, 1.5 + viewport.scale * 0.24),
        0,
        Math.PI * 2,
      )
      context.fill()
    }

    const labelClusters = viewport.scale < 1.8 ? broadClusters : childClusters
    for (const cluster of labelClusters) {
      const x = screenX(cluster.x)
      const y = screenY(cluster.y)
      if (!isVisible(x, y, 100)) continue
      drawLabel(
        context,
        cluster.label,
        x,
        y,
        cluster.level === 1 ? 15 : 11,
        cluster.level === 1 ? 0.9 : Math.min(0.82, 0.35 + viewport.scale * 0.12),
      )
    }

    if (viewport.scale >= 3.2) {
      for (const point of visiblePoints) {
        const important =
          point.movie.id === selected?.id ||
          selectedEdges.some((result) => result.movie.id === point.movie.id) ||
          point.movie.ratingCount >= (viewport.scale >= 6 ? 60 : 350)
        if (!important) continue
        drawMovieTitle(context, point.movie.title, point.x, point.y - 9)
      }
    }
  }, [
    renderVersion,
    movies,
    clusters,
    edges,
    selected,
    selectedEdges,
    bounds,
    broadClusters,
    childClusters,
    broadOrder,
  ])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(scheduleDraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [scheduleDraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rectangle = canvas.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * 0.0012)
      zoomAt(event.clientX - rectangle.left, event.clientY - rectangle.top, factor)
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [zoomAt])

  useEffect(() => {
    if (!selected || movies.length === 0) return
    if (previousSelectedRef.current === null) {
      previousSelectedRef.current = selected.id
      return
    }
    if (previousSelectedRef.current === selected.id) return
    previousSelectedRef.current = selected.id

    const canvas = canvasRef.current
    if (!canvas) return
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const padding = 42
    const baseX = padding + ((selected.x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * (width - padding * 2)
    const baseY = padding + ((selected.y - bounds.minY) / (bounds.maxY - bounds.minY || 1)) * (height - padding * 2)
    animateViewport(
      viewportRef,
      {
        scale: Math.max(2.2, viewportRef.current.scale),
        x: width / 2 - baseX * Math.max(2.2, viewportRef.current.scale),
        y: height / 2 - baseY * Math.max(2.2, viewportRef.current.scale),
      },
      updateViewport,
      animationRef,
    )
  }, [selected, movies.length, bounds, updateViewport])

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
  }, [])

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rectangle = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerPosition(event)
    pointersRef.current.set(event.pointerId, point)
    gestureRef.current.lastX = point.x
    gestureRef.current.lastY = point.y
    gestureRef.current.dragged = false
    if (pointersRef.current.size === 2) {
      const [first, second] = [...pointersRef.current.values()]
      gestureRef.current.distance = Math.hypot(second.x - first.x, second.y - first.y)
      gestureRef.current.lastX = (first.x + second.x) / 2
      gestureRef.current.lastY = (first.y + second.y) / 2
    }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointersRef.current.has(event.pointerId)) return
    const point = pointerPosition(event)
    pointersRef.current.set(event.pointerId, point)
    const gesture = gestureRef.current

    if (pointersRef.current.size === 1) {
      const dx = point.x - gesture.lastX
      const dy = point.y - gesture.lastY
      if (Math.abs(dx) + Math.abs(dy) > 1) gesture.dragged = true
      const current = viewportRef.current
      updateViewport({ ...current, x: current.x + dx, y: current.y + dy })
      gesture.lastX = point.x
      gesture.lastY = point.y
      return
    }

    const [first, second] = [...pointersRef.current.values()]
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    const centerX = (first.x + second.x) / 2
    const centerY = (first.y + second.y) / 2
    if (gesture.distance > 0) {
      zoomAt(centerX, centerY, distance / gesture.distance)
      const current = viewportRef.current
      updateViewport({
        ...current,
        x: current.x + centerX - gesture.lastX,
        y: current.y + centerY - gesture.lastY,
      })
    }
    gesture.distance = distance
    gesture.lastX = centerX
    gesture.lastY = centerY
    gesture.dragged = true
  }

  function handlePointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    pointersRef.current.delete(event.pointerId)
    if (pointersRef.current.size === 1) {
      const [point] = pointersRef.current.values()
      gestureRef.current.lastX = point.x
      gestureRef.current.lastY = point.y
    }
    gestureRef.current.distance = 0
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (gestureRef.current.dragged) {
      gestureRef.current.dragged = false
      return
    }
    const rectangle = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rectangle.left
    const y = event.clientY - rectangle.top
    let closest: { movie: Movie; distance: number } | null = null
    for (const point of screenPointsRef.current) {
      const distance = Math.hypot(point.x - x, point.y - y)
      if (!closest || distance < closest.distance) closest = { movie: point.movie, distance }
    }
    if (closest && closest.distance < 13) onSelect(closest.movie)
  }

  function resetView() {
    const canvas = canvasRef.current
    if (!canvas) return
    animateViewport(
      viewportRef,
      { scale: 1, x: 0, y: 0 },
      updateViewport,
      animationRef,
    )
  }

  return (
    <div className="movie-map">
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onDoubleClick={(event) => {
          const rectangle = event.currentTarget.getBoundingClientRect()
          zoomAt(event.clientX - rectangle.left, event.clientY - rectangle.top, 1.8)
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label="Interactive zoomable movie similarity map"
      />
      <div className="map-controls" aria-label="Map zoom controls">
        <button type="button" onClick={() => zoomAt(40, 40, 1.35)} aria-label="Zoom in">+</button>
        <span>{zoomPercent}%</span>
        <button type="button" onClick={() => zoomAt(40, 40, 1 / 1.35)} aria-label="Zoom out">−</button>
        <button type="button" className="fit-button" onClick={resetView}>Fit</button>
      </div>
      <p className="map-hint">Scroll to zoom · drag to pan · double-click to explore</p>
    </div>
  )
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  opacity: number,
) {
  context.font = `600 ${size}px "DM Sans", sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  const width = context.measureText(text).width + 16
  context.fillStyle = `rgba(255, 253, 247, ${opacity * 0.88})`
  context.fillRect(x - width / 2, y - size, width, size * 2)
  context.fillStyle = `rgba(32, 42, 36, ${opacity})`
  context.fillText(text, x, y)
}

function drawMovieTitle(
  context: CanvasRenderingContext2D,
  title: string,
  x: number,
  y: number,
) {
  const text = title.length > 24 ? `${title.slice(0, 22)}…` : title
  context.font = '600 9px "DM Sans", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'bottom'
  context.fillStyle = 'rgba(32, 42, 36, .9)'
  context.fillText(text, x, y)
}

function animateViewport(
  viewportRef: React.MutableRefObject<Viewport>,
  target: Viewport,
  update: (viewport: Viewport) => void,
  animationRef: React.MutableRefObject<number | null>,
) {
  if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
  const start = { ...viewportRef.current }
  const startedAt = performance.now()
  const duration = 360

  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration)
    const eased = 1 - (1 - progress) ** 3
    update({
      scale: start.scale + (target.scale - start.scale) * eased,
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
    })
    if (progress < 1) animationRef.current = requestAnimationFrame(step)
    else animationRef.current = null
  }
  animationRef.current = requestAnimationFrame(step)
}
