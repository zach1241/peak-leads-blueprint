const labels = { todo: "To Do", in_progress: "In Progress", review: "Review", done: "Done" };
export function TaskStatusOverview({ counts }: { counts: { status: keyof typeof labels; count: number }[] }) {
  const total = counts.reduce((sum, row) => sum + row.count, 0);
  const segments = counts.map((row, i) => ({
    ...row, length: total ? row.count / total * 100 : 0,
    offset: total ? counts.slice(0, i).reduce((sum, item) => sum + item.count, 0) / total * 100 : 0,
  }));
  return <section className="panel section-gap">
    <div className="panel-heading"><div><h2>Task Status overview</h2><p>Live workspace work · Backlog and cancelled tasks excluded.</p></div></div>
    <div className="task-status-chart">
      <svg viewBox="0 0 160 160" role="img" aria-label={`Task status overview: ${total} tasks. ${counts.map(row => `${labels[row.status]}: ${row.count}`).join(", ")}`}>
        <circle cx="80" cy="80" r="60" fill="none" stroke="var(--border)" strokeWidth="16" />
        {segments.map(row => <circle key={row.status} className={`status-segment status-${row.status}`} cx="80" cy="80" r="60" fill="none" strokeWidth="16" pathLength="100" strokeDasharray={`${row.length} ${100 - row.length}`} strokeDashoffset={-row.offset} transform="rotate(-90 80 80)" />)}
        <text x="80" y="79" textAnchor="middle" className="chart-total">{total}</text>
        <text x="80" y="98" textAnchor="middle" className="chart-caption">Total tasks</text>
      </svg>
      <ul>{counts.map(row => <li key={row.status}><span className={`chart-dot status-${row.status}`} /><span>{labels[row.status]}</span><strong>{row.count}</strong></li>)}</ul>
      {!total && <p className="data-note">No tasks in these statuses yet.</p>}
    </div>
  </section>;
}
