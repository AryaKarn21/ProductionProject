import { useQuery } from '@tanstack/react-query'
import ReactApexChart from 'react-apexcharts'
import { AlertTriangle } from 'lucide-react'
import { settingsAPI } from '@/api/settings.api'

const BAR_COLOR = '#6366f1'

export default function AuditModuleChart() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => settingsAPI.getAuditStats().then((r) => r.data),
    staleTime: 30_000,
  })

  const rows = (data?.byModule || [])
    .filter((m) => m.module && m.module !== 'unknown')
    .sort((a, b) => b.count - a.count)
    .slice(0, 8) // top 8 modules — keeps the bar chart readable on mobile

  const options = {
    chart: {
      // A fixed id (rather than ApexCharts' auto-generated one) avoids a
      // known issue where Vite's hot-reload leaves a stale chart instance
      // registered under the same id, which can make a re-mounted chart
      // silently fail to draw anything.
      id: 'audit-module-chart',
      type: 'bar',
      background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true, easing: 'easeinout', speed: 400 },
    },
    theme: { mode: 'dark' },
    colors: [BAR_COLOR],
    plotOptions: {
      bar: { borderRadius: 6, columnWidth: '45%', distributed: false },
    },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    grid: { borderColor: 'rgba(148,163,184,0.15)', strokeDashArray: 4 },
    xaxis: {
      categories: rows.map((r) => r.module),
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { style: { colors: '#94a3b8', fontSize: '11px' } },
    },
    tooltip: { theme: 'dark' },
    legend: { show: false },
  }

  const series = [{ name: 'Events', data: rows.map((r) => r.count) }]

  return (
    <div className="card p-4 sm:p-6">
      <div className="mb-3 sm:mb-4">
        <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Activity by Module
        </h3>
        <p className="text-[11px] sm:text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Event volume across the last logged period
        </p>
      </div>

      {isLoading ? (
        <div className="h-[240px] rounded-lg animate-pulse" style={{ background: 'var(--border)' }} />
      ) : isError ? (
        <div className="h-[240px] flex flex-col items-center justify-center gap-2 text-center">
          <AlertTriangle size={18} className="text-rose-400" />
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {error?.response?.data?.message || 'Could not load activity stats.'}
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
          No activity recorded yet.
        </div>
      ) : (
        // Keying on the row signature forces a clean remount (rather than
        // an in-place update) whenever the underlying data actually
        // changes, which sidesteps ApexCharts sometimes failing to resize
        // itself correctly on props-only updates inside a conditionally
        // rendered tab.
        <div className="min-w-0 overflow-x-auto">
          <div style={{ minWidth: Math.max(rows.length * 70, 280) }}>
            <ReactApexChart
              key={rows.map((r) => `${r.module}:${r.count}`).join('|')}
              options={options}
              series={series}
              type="bar"
              height={240}
            />
          </div>
        </div>
      )}
    </div>
  )
}