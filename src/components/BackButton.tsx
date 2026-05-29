import { useNavigate } from "react-router-dom";

type Props = {
  to?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export default function BackButton({ to = "/", onClick, style }: Props) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) onClick();
    else navigate(to);
  };

  return (
    <button
      onClick={handleClick}
      className="back-btn"
      aria-label="Retour"
      style={style}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M13 4L7 10L13 16"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
