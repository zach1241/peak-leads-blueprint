import Link from "next/link";
import { label } from "@/lib/data/constants";
export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{label(value)}</span>;
}
export function PageHeading({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">WORKSPACE</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {href && (
        <Link className="button primary" href={href}>
          {action}
        </Link>
      )}
    </div>
  );
}
export function Pagination({
  page,
  count,
  href,
}: {
  page: number;
  count: number;
  href: string;
}) {
  const separator = href.includes("?") ? "&" : "?";
  return (
    <div className="pagination">
      <span>
        {count} records · Page {page} of {Math.max(1, Math.ceil(count / 25))}
      </span>
      <div>
        {page > 1 && (
          <Link href={`${href}${separator}page=${page - 1}`}>Previous</Link>
        )}
        {page * 25 < count && (
          <Link href={`${href}${separator}page=${page + 1}`}>Next</Link>
        )}
      </div>
    </div>
  );
}
export function pageNumber(value?: string) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 100000 ? n : 1;
}
export function Field({
  name,
  title,
  value,
  required,
  type = "text",
  maxLength,
}: {
  name: string;
  title: string;
  value?: string | null;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label>
      {title}
      <input
        name={name}
        type={type}
        defaultValue={value ?? ""}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}
export function SelectField({
  name,
  title,
  value,
  options,
  empty,
}: {
  name: string;
  title: string;
  value?: string | null;
  options: { value: string; label: string }[];
  empty?: string;
}) {
  return (
    <label>
      {title}
      <select name={name} defaultValue={value ?? ""}>
        {empty && <option value="">{empty}</option>}
        {options.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function TextField({
  name,
  title,
  value,
  maxLength = 10000,
}: {
  name: string;
  title: string;
  value?: string | null;
  maxLength?: number;
}) {
  return (
    <label className="full-field">
      {title}
      <textarea
        name={name}
        defaultValue={value ?? ""}
        rows={4}
        maxLength={maxLength}
      />
    </label>
  );
}
