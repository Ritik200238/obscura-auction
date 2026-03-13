import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SavingsData {
  auction: string
  winningBid: number
  secondPrice: number
  savings: number
}

export default function VickreySavingsChart({ data, totalSavings }: { data: SavingsData[]; totalSavings: number }) {
  return (
    <div className="glass rounded-2xl border border-surface-700/50 p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Vickrey Savings</h3>
        <span className="text-xs text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20">
          {totalSavings.toLocaleString()} ALEO saved
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="auction" stroke="#6b7280" fontSize={12} tickLine={false} />
            <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#081320',
                border: '1px solid #1e3a5f',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '12px',
              }}
              formatter={(value, name) => [`${value} ALEO`, name]}
            />
            <Bar dataKey="secondPrice" stackId="price" fill="#0891b2" name="Price Paid (2nd highest)" radius={[0, 0, 4, 4]} />
            <Bar dataKey="savings" stackId="price" fill="#22c55e" name="Savings" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-xs text-gray-500 mt-3">
        Bidders saved <span className="text-green-400 font-semibold">{totalSavings.toLocaleString()} ALEO</span> total through fair Vickrey pricing
      </p>
    </div>
  )
}
