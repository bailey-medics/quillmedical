import type { ComponentType } from "react";
import Icon from "@/components/icons/Icon";
import classes from "./PublicFeatureCard.module.css";

export interface PublicFeatureCardProps {
  /** Tabler icon component displayed at the top */
  icon: ComponentType;
  /** Card title */
  title: string;
  /** Card body text */
  body: string;
  /** Optional URL — makes card a clickable link with hover animation */
  href?: string;
}

export function PublicFeatureCard({
  icon: IconComponent,
  title,
  body,
  href,
}: PublicFeatureCardProps) {
  const content = (
    <>
      <div className={classes.icon}>
        <Icon icon={<IconComponent />} size="xl" />
      </div>
      <div className={classes.title}>{title}</div>
      <div className={classes.body}>{body}</div>
    </>
  );

  if (href) {
    return (
      <a
        data-testid="feature-card"
        className={`${classes.card} ${classes.clickable}`}
        href={href}
      >
        {content}
      </a>
    );
  }

  return (
    <div data-testid="feature-card" className={classes.card}>
      {content}
    </div>
  );
}

export default PublicFeatureCard;
