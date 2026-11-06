import type { GatewayHealthResponse } from '../types/index.js';

export function renderDashboardHtml(health: GatewayHealthResponse): string {
  const successRate =
    health.stats.totalRequests > 0
      ? Math.round((health.stats.successfulRequests / health.stats.totalRequests) * 100)
      : 100;

  const statusColor =
    health.status === 'ok' ? '#10b981' : health.status === 'degraded' ? '#f59e0b' : '#ef4444';

  const providerRows = health.providers
    .map((p) => {
      const isOnline = p.isHealthy && p.circuitState === 'CLOSED';
      const badgeColor = isOnline ? '#10b981' : p.circuitState === 'HALF_OPEN' ? '#f59e0b' : '#ef4444';
      const badgeText = isOnline ? 'ONLINE' : p.circuitState === 'HALF_OPEN' ? 'TESTING' : 'OFFLINE / COOLDOWN';

      return `
      <tr style="border-bottom: 1px solid #1e293b;">
        <td style="padding: 12px 16px; font-weight: 600; color: #f8fafc;">
          ${escapeHtml(p.name)}
          ${p.id === health.activeProvider ? '<span style="font-size: 11px; margin-left: 8px; padding: 2px 6px; background: #3b82f6; border-radius: 4px; color: #fff;">ACTIVE</span>' : ''}
        </td>
        <td style="padding: 12px 16px;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${badgeColor}; margin-right: 6px;"></span>
          <span style="font-size: 13px; font-weight: 500; color: ${badgeColor};">${badgeText}</span>
        </td>
        <td style="padding: 12px 16px; font-family: monospace; font-size: 13px; color: #94a3b8;">
          ${p.circuitState}
        </td>
        <td style="padding: 12px 16px; font-family: monospace; font-size: 13px; color: #94a3b8;">
          ${p.latencyMs !== undefined ? `${p.latencyMs} ms` : 'N/A'}
        </td>
        <td style="padding: 12px 16px; font-size: 13px; color: ${p.lastError ? '#f87171' : '#64748b'};">
          ${p.lastError ? escapeHtml(p.lastError.slice(0, 45)) : 'None'}
        </td>
      </tr>
      `;
    })
    .join('');

  const failedEngineKeys = Object.keys(health.stats.recentFailedEngines);
  const failedEnginesHtml =
    failedEngineKeys.length > 0
      ? failedEngineKeys
          .map(
            (eng) =>
              `<span style="background: #334155; padding: 4px 8px; border-radius: 4px; margin-right: 6px; font-size: 12px; color: #f87171;">${escapeHtml(
                eng
              )}: ${health.stats.recentFailedEngines[eng]} fails</span>`
          )
          .join(' ')
      : '<span style="color: #64748b; font-size: 13px;">No engine suspensions recorded.</span>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dora Search Infrastructure Status</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; padding: 24px; line-height: 1.5; }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #1e293b; }
    .title { font-size: 22px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 10px; }
    .badge-pill { padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #131d31; border: 1px solid #1e293b; border-radius: 8px; padding: 18px; }
    .card-title { font-size: 13px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 8px; }
    .card-value { font-size: 26px; font-weight: 700; color: #f8fafc; font-family: monospace; }
    .table-container { background: #131d31; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #0f172a; padding: 12px 16px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; border-bottom: 1px solid #1e293b; }
    .footer { font-size: 12px; color: #64748b; display: flex; justify-content: space-between; align-items: center; padding-top: 12px; }
    .refresh-btn { background: #2563eb; color: #fff; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; }
    .refresh-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        Dora Search Infrastructure Status
      </div>
      <div style="display: flex; gap: 12px; align-items: center;">
        <span class="badge-pill" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}66;">
          System ${health.status.toUpperCase()}
        </span>
        <button class="refresh-btn" onclick="location.reload()">Refresh</button>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Success Rate</div>
        <div class="card-value" style="color: ${successRate > 90 ? '#10b981' : '#f59e0b'};">${successRate}%</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${health.stats.successfulRequests} of ${health.stats.totalRequests} queries</div>
      </div>
      <div class="card">
        <div class="card-title">Average Latency</div>
        <div class="card-value">${health.stats.averageLatencyMs} ms</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Global gateway routing</div>
      </div>
      <div class="card">
        <div class="card-title">Gateway Uptime</div>
        <div class="card-value">${formatUptime(health.gateway.uptimeSeconds)}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Since startup</div>
      </div>
      <div class="card">
        <div class="card-title">Active Origin</div>
        <div class="card-value" style="font-size: 20px; color: #3b82f6;">${escapeHtml(health.activeProvider.toUpperCase())}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Primary failover target</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Provider Target</th>
            <th>Status</th>
            <th>Circuit Breaker</th>
            <th>Latency</th>
            <th>Recent Warning/Error</th>
          </tr>
        </thead>
        <tbody>
          ${providerRows}
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom: 24px;">
      <div class="card-title">Upstream Engine Health</div>
      <div style="margin-top: 8px;">
        ${failedEnginesHtml}
      </div>
    </div>

    <div class="footer">
      <div>Dora Search v${escapeHtml(health.gateway.version)} &bull; Secure API Gateway &bull; Zero Public Upstream Credentials</div>
      <div>Last checked: ${escapeHtml(health.gateway.timestamp)}</div>
    </div>
  </div>
  <script>
    // Auto-refresh every 30s
    setTimeout(function() { location.reload(); }, 30000);
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h ${minutes % 60}m`;
}

