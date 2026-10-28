import type { Person } from "../../shared/types";
export default function Avatar({
  person,
  size = 48,
}: {
  person: Person;
  size?: number;
}) {
  const index = parseInt(person.id.slice(-2), 10) || 1;
  const feminine = [2, 4, 5, 7].includes(index);
  const skin = ["#d5a181", "#efc4a5", "#bb866d", "#eac4a7"][index % 4];
  const hair = ["#30302e", "#493b35", "#6b5140", "#292d36"][index % 4];
  return (
    <svg
      className="avatar"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={person.name}
      style={{ background: person.color }}
    >
      <defs>
        <clipPath id={`clip-${person.id}-${size}`}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${person.id}-${size})`}>
        {feminine && <path d="M24 46C20 5 77 5 77 48L82 82H18Z" fill={hair} />}
        <path
          d="M11 106C12 73 31 70 50 70S88 75 91 106"
          fill={index % 2 ? "#f3f0e8" : "#48586a"}
        />
        <path d="M42 64v11q8 13 16 0V64" fill={skin} />
        <ellipse cx="50" cy="45" rx="23" ry="29" fill={skin} />
        <path
          d={
            feminine
              ? "M26 42C23 16 54 7 70 26L76 48Q58 40 54 27Q42 45 26 42"
              : "M26 41Q20 15 46 13Q78 8 74 43L65 30Q50 38 32 29Z"
          }
          fill={hair}
        />
        <path
          d="M37 46h4m17 0h4"
          stroke="#3a302b"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d="M44 59q7 5 13-1"
          stroke="#a15e52"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {index === 3 && (
          <path
            d="M31 43h15v10H32Zm23 0h15v10H54ZM46 47h8"
            fill="none"
            stroke="#4a453f"
            strokeWidth="2"
          />
        )}
      </g>
    </svg>
  );
}
