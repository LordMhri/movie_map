import { useEffect, useRef, useState } from 'react'
import type { Movie, SimilarResult } from './types'

type Body = {
  movie: Movie
  score: number
  x: number
  y: number
  vx: number
  vy: number
}

export function Constellation({
  query,
  results,
  onSelect,
  onClose,
}: {
  query: Movie
  results: SimilarResult[]
  onSelect: (movie: Movie) => void
  onClose: () => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const bodiesRef = useRef(new Map<number, Body>())
  const draggedRef = useRef<number | null>(null)
  const movedRef = useRef(false)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [, setVersion] = useState(0)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      })
    })
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const centerX = size.width / 2
    const centerY = size.height / 2
    const radius = Math.min(size.width, size.height) * 0.3
    const bodies = new Map<number, Body>()
    bodies.set(query.id, {
      movie: query,
      score: 1,
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
    })
    results.forEach((result, index) => {
      const angle = (index / Math.max(results.length, 1)) * Math.PI * 2 - Math.PI / 2
      const stagger = radius * (0.82 + (index % 3) * 0.09)
      bodies.set(result.movie.id, {
        movie: result.movie,
        score: result.score,
        x: centerX + Math.cos(angle) * stagger,
        y: centerY + Math.sin(angle) * stagger,
        vx: Math.cos(angle) * 2.5,
        vy: Math.sin(angle) * 2.5,
      })
    })
    bodiesRef.current = bodies
    setVersion((version) => version + 1)
  }, [query, results, size])

  useEffect(() => {
    let frame = 0
    const step = () => {
      const bodies = [...bodiesRef.current.values()]
      const center = bodiesRef.current.get(query.id)
      if (!center) return

      for (let left = 0; left < bodies.length; left += 1) {
        for (let right = left + 1; right < bodies.length; right += 1) {
          const first = bodies[left]
          const second = bodies[right]
          const dx = second.x - first.x
          const dy = second.y - first.y
          const distanceSquared = Math.max(100, dx * dx + dy * dy)
          const distance = Math.sqrt(distanceSquared)
          const force = 1100 / distanceSquared
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force
          if (draggedRef.current !== first.movie.id) {
            first.vx -= fx
            first.vy -= fy
          }
          if (draggedRef.current !== second.movie.id) {
            second.vx += fx
            second.vy += fy
          }
        }
      }

      const orbit = Math.min(size.width, size.height) * 0.28
      for (const body of bodies) {
        if (draggedRef.current === body.movie.id) continue
        if (body.movie.id === query.id) {
          body.vx += (size.width / 2 - body.x) * 0.012
          body.vy += (size.height / 2 - body.y) * 0.012
        } else {
          const dx = body.x - center.x
          const dy = body.y - center.y
          const distance = Math.max(1, Math.hypot(dx, dy))
          const spring = (distance - orbit) * 0.006
          body.vx -= (dx / distance) * spring
          body.vy -= (dy / distance) * spring
        }
        body.vx *= 0.9
        body.vy *= 0.9
        body.x = Math.max(34, Math.min(size.width - 34, body.x + body.vx))
        body.y = Math.max(34, Math.min(size.height - 34, body.y + body.vy))
      }
      setVersion((version) => version + 1)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [query.id, size])

  function moveDragged(event: React.PointerEvent<SVGSVGElement>) {
    const id = draggedRef.current
    const svg = svgRef.current
    if (id === null || !svg) return
    const rectangle = svg.getBoundingClientRect()
    const body = bodiesRef.current.get(id)
    if (!body) return
    body.x = event.clientX - rectangle.left
    body.y = event.clientY - rectangle.top
    body.vx = 0
    body.vy = 0
    movedRef.current = true
    setVersion((version) => version + 1)
  }

  const bodies = [...bodiesRef.current.values()]
  const center = bodiesRef.current.get(query.id)

  return (
    <div className="constellation">
      <div className="constellation-heading">
        <span>
          <small>Constellation mode</small>
          <strong>Drag the stars. Select one to travel.</strong>
        </span>
        <button type="button" onClick={onClose}>Return to map</button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.width} ${size.height}`}
        onPointerMove={moveDragged}
        onPointerUp={(event) => {
          svgRef.current?.releasePointerCapture(event.pointerId)
          draggedRef.current = null
        }}
        onPointerCancel={() => {
          draggedRef.current = null
        }}
        aria-label={`Interactive constellation for ${query.title}`}
      >
        <defs>
          <filter id="star-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {center && bodies.filter((body) => body.movie.id !== query.id).map((body) => (
          <line
            key={`link-${body.movie.id}`}
            x1={center.x}
            y1={center.y}
            x2={body.x}
            y2={body.y}
            style={{ opacity: 0.15 + Math.max(0, body.score) * 0.55 }}
          />
        ))}
        {bodies.map((body) => {
          const selected = body.movie.id === query.id
          return (
            <g
              key={body.movie.id}
              className={selected ? 'constellation-node selected' : 'constellation-node'}
              transform={`translate(${body.x} ${body.y})`}
              onPointerDown={(event) => {
                svgRef.current?.setPointerCapture(event.pointerId)
                draggedRef.current = body.movie.id
                movedRef.current = false
              }}
              onClick={() => {
                if (!movedRef.current && !selected) onSelect(body.movie)
              }}
            >
              <circle r={selected ? 13 : 6 + Math.max(0, body.score) * 6} />
              <text y={selected ? 29 : 23}>{shortTitle(body.movie.title)}</text>
              {!selected && <text className="constellation-score" y={36}>{Math.round(body.score * 100)}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function shortTitle(title: string) {
  return title.length > 22 ? `${title.slice(0, 20)}…` : title
}
