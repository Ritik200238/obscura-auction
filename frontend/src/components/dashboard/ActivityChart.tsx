import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface ActivityData {
  day: string
  auctions: number
  bids: number
}

export default function ActivityChart({ data }: { data: ActivityData[] }) {
  return (
    <div className="glass rounded-2xl border border-surface-700/50 p-5 h-full">
      <h3 className="text-lg font-semibold text-white mb-4">Auction Activity</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="day" stroke="#6b7280" fontSize={12} tickLine={false} />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#081320',
                border: '1px solid #1e3a5f',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '12px',
              }}
            />
            <Line
              type="monotone"
              dataKey="auctions"
              stroke="#0891b2"
              strokeWidth={2}
              dot={{ fill: '#0891b2', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#0891b2', strokeWidth: 2, fill: '#081320' }}
              name="Auctions Created"
            />
            <Line
              type="monotone"
              dataKey="bids"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: '#06b6d4', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, stroke: '#06b6d4', strokeWidth: 2, fill: '#081320' }}
              name="Bids Placed"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-accent-600" />
          <span className="text-xs text-gray-400">Auctions Created</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-500" />
          <span className="text-xs text-gray-400">Bids Placed</span>
        </div>
      </div>
    </div>
  )
}
