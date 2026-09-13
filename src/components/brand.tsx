import Image from "next/image";

export function Brand() {
  return (
    <div className="brand">
      <Image
        className="brand-mark"
        src="/brand/peak-leads-icon.png"
        alt=""
        width={35}
        height={35}
        unoptimized
      />
      <span>
        Peak Leads<small>OPERATIONS</small>
      </span>
    </div>
  );
}
