import { Link } from "react-router-dom";

export function Markdown({ text }) {
  return (
    <div className="md">
      {(text || "").split("\n").map((line, index) => {
        if (line.startsWith("# ")) return <h1 key={index}>{line.slice(2)}</h1>;
        if (line.startsWith("## ")) return <h2 key={index}>{line.slice(3)}</h2>;
        if (line.startsWith("- ")) return <p key={index}>· {line.slice(2)}</p>;
        if (!line.trim() || line.startsWith("```")) return null;
        return <p key={index}>{line}</p>;
      })}
    </div>
  );
}

export function Notice({ error, children }) {
  if (!error && !children) return null;
  return <p role={error ? "alert" : "status"} className={error ? "notice bad" : "notice"}>{error ? error.message || String(error) : children}</p>;
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }) {
  return <p className="muted">{children}</p>;
}

export function PageTitle({ kicker, title, children }) {
  return (
    <div className="section-head">
      <div>
        {kicker ? <div className="faint">{kicker}</div> : null}
        <h2>{title}</h2>
      </div>
      <div className="muted">{children}</div>
    </div>
  );
}

export function PillLink({ to, children }) {
  return (
    <Link className="btn" to={to}>
      {children}
    </Link>
  );
}
