/** Activity-rail glyph: a small waveform, drawn in `currentColor`. */

export function SoundDeskGlyph({ size = 20, active = false }: { size?: number; active?: boolean }) {
  const bars = [0.34, 0.62, 1, 0.72, 0.46, 0.84, 0.38]
  const width = size
  const height = size
  const step = width / (bars.length + 1)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {bars.map((scale, index) => {
        const barHeight = Math.max(2, height * 0.72 * scale)
        const x = step * (index + 1) - 1
        const y = (height - barHeight) / 2
        return (
          <rect
            key={index}
            x={x}
            y={y}
            width={2}
            height={barHeight}
            rx={1}
            fill="currentColor"
            opacity={active ? 1 : 0.86}
          />
        )
      })}
    </svg>
  )
}
