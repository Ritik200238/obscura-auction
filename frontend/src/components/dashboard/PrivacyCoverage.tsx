import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

interface PrivacySlice {
  name: string
  value: number
  color: string
}

export default function PrivacyCoverage({ data }: { data: PrivacySlice[] }) {
  const privatePercent = data.find(d => d.name === 'Hidden')?.value ?? 97

  return (
    <div className="glass rounded-2xl border border-surface-700/50 p-5 h-full">
      <h3 className="text-lg font-semibold text-white mb-4">Privacy Coverage</h3>
      <div className="h-56 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
          <p className="text-3xl font-bold text-white">{privatePercent}%</p>
          <p className="text-xs text-gray-400">Private</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-6 mt-2">
        {data.map(entry => (
          <div key={entry.name} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-xs text-gray-400">{entry.name} Fields</span>
          </div>
        ))}
      </div>
    </div>
  )
}
