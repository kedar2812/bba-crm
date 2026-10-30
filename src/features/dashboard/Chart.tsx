import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr, inrCompact } from '@/lib/format'

export interface ChartRow {
  label: string
  [k: string]: number | string
}

/** Grouped bar chart. Two series max: gold (primary) + ink (secondary). */
export default function Chart({ data, series, money }: { data: ChartRow[]; series: { key: string; label: string }[]; money?: boolean }) {
  const colors = ['#E0A82E', '#0B0B0B']
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="#F0E9DA" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={8} tick={{ fontSize: 12, fill: '#8A8A8A' }} />
        <YAxis tickLine={false} axisLine={false} width={money ? 52 : 32} allowDecimals={false} tick={{ fontSize: 11, fill: '#8A8A8A' }} tickFormatter={(v: number) => (money ? inrCompact(v) : String(v))} />
        <Tooltip
          cursor={{ fill: 'rgba(224,168,46,.08)' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #E8E1D3', fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}
          formatter={(v: number, name: string) => [money ? inr(v) : v, series.find((s) => s.key === name)?.label ?? name]}
        />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} fill={colors[i]} radius={[6, 6, 0, 0]} maxBarSize={22} animationDuration={600} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
