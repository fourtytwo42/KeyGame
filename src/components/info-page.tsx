import type { ReactNode } from "react";

export function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <article className="infoPage">
      <header className="infoHeader">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
      </header>
      <div className="infoBody">{children}</div>
    </article>
  );
}
