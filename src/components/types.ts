import type { HTMLAttributes } from "astro/types";

export interface IconProps extends HTMLAttributes<"svg"> {
    class?: string;
    className?: string;
    size?: number | string;
}

export type IconComponent = (_props: any) => any;

export interface ValorCardProps {
    id: number;
    title: string;
    description: string;
    badge: string;
    icon: IconComponent;
    // Campos opcionales para el reverso
    backTitle?: string;
    backDescription?: string;
    features?: string[];
    ctaText?: string;
    ctaLink?: string;
}

export type Props = IconProps;


