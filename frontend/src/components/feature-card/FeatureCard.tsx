import type { ComponentType } from "react";
import Icon from "@/components/icons/Icon";
import classes from "./FeatureCard.module.css";

export interface FeatureCardProps {
  /** Tabler icon component displayed at the top */
  icon: ComponentType;
  /** Card title */
  title: string;
  /** Card body text */
  body: string;
  /** Optional click handler — makes card interactive with hover animation */
  onClick?: () => void;
}

export function FeatureCard({
  icon: IconComponent,
  title,
  body,
  onClick,
}: FeatureCardProps) {
  return (
    <div
      data-testid="feature-card"
      className={`${classes.card}${onClick ? ` ${classes.clickable}` : ""}`}
      onClick={onClick}
    >
      <div className={classes.icon}>
        <Icon icon={<IconComponent />} size="xl" />
      </div>
      <div className={classes.title}>{title}</div>
      <div className={classes.body}>{body}</div>
    </div>
  );
}

export default FeatureCard;
