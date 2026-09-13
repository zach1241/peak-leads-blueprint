import type { currentMonthBurndown } from "@/lib/data/burndown";
export function MonthBurndown({ data }: { data: Awaited<ReturnType<typeof currentMonthBurndown>> }) {
  const x = (day: number) => 48 + (day - 1) / Math.max(data.days - 1, 1) * 600;
  const y = (remaining: number) => 180 - remaining / Math.max(data.total, 1) * 150;
  const path = data.actual.map((point, index) => {
    if (point.remaining === null) return "";
    const command = index > 0 && data.actual[index - 1].remaining !== null ? "L" : "M";
    return `${command}${x(point.day)},${y(point.remaining)}`;
  }).join(" ");
  const known = data.actual.filter(point => point.remaining !== null);
  return <section className="panel section-gap">
    <div className="panel-heading"><div><h2>Current Month Burndown</h2><p>{data.month} · Remaining: {data.remaining} · Completed this month: {data.completedThisMonth}</p></div></div>
    <div className="burndown-chart">
      {data.total ? <svg viewBox="0 0 680 230" role="img" aria-label={`Current month burndown. ${data.remaining} remaining tasks. ${data.completedThisMonth} completed this month. Actual history starts ${known[0] ? `on day ${known[0].day}` : "when reliable events are available"}.`}>
        <path d="M48 25V180H648" fill="none" stroke="var(--border)" />
        <path d={`M${x(1)},${y(data.total)}L${x(data.days)},${y(0)}`} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="6 5" />
        <path d={path} fill="none" stroke="var(--brand-blue)" strokeWidth="3" />
        {known.map(point => <circle key={point.day} cx={x(point.day)} cy={y(point.remaining!)} r="3" fill="var(--brand-blue)"><title>{`Day ${point.day}: ${point.remaining} remaining`}</title></circle>)}
        <text x="38" y="34" textAnchor="end">{data.total}</text><text x="38" y="184" textAnchor="end">0</text>
        {[1, Math.ceil(data.days / 2), data.days].map(day => <text key={day} x={x(day)} y="204" textAnchor="middle">{day}</text>)}
        <text x="348" y="226" textAnchor="middle">Day of month</text>
      </svg> : <p className="data-note">No actionable tasks are scheduled for this month.</p>}
      <p className="data-note"><span className="burndown-actual">● Actual remaining</span> · <span>– – Ideal remaining</span></p>
      <p className="data-note">Current scope: recurring periods overlapping this month, plus other tasks due this month. Cancelled tasks and responsibilities excluded. Added work can raise the line; scope changes recalculate it.</p>
      <p className="data-note">Actual history begins at the recorded status baseline; earlier dates are left blank. Today is a live snapshot. Completion totals use recorded Done events, never last-edited dates.</p>
      {!!known.length && <details><summary>Daily values</summary><ul className="record-list">{known.map(point => <li key={point.day}>Day {point.day}: {point.remaining} remaining</li>)}</ul></details>}
    </div>
  </section>;
}
