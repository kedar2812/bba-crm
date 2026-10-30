import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { inr, inrCompact } from '@/lib/format'

export default function HBar({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#4A4A4A' }} />
        <Tooltip cursor={{ fill: 'rgba(224,168,46,.08)' }} contentStyle={{ borderRadius: 12, border: '1px solid #E8E1D3', fontSize: 13 }} formatter={(v: number) => [inr(v), 'Business']} />
        <Bar dataKey="value" fill="#E0A82E" radius={[0, 6, 6, 0]} maxBarSize={20} label={{ position: 'right', fontSize: 11, fill: '#4A4A4A', formatter: (v: number) => inrCompact(v) }} />
      </BarChart>
    </ResponsiveContainer>
  )
}
