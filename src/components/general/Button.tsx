export interface ButtonProps {
    text?: string;
    href?: string;
    onClick?: () => void;
    className?: string;
    variant?: "primary" | "secondary" | "outline" | "gradient" | "ghost" | "white";
    size?: "sm" | "md" | "lg";
    children?: React.ReactNode;
    type?: "button" | "submit" | "reset";
    target?: string;
    rel?: string;
}

export default function Button({
    text,
    href,
    onClick,
    className = "",
    variant = "primary",
    size = "md",
    children,
    type = "button",
    target,
    rel,
}: Readonly<ButtonProps>) {
    // 1. Clases base globales
    const baseClasses =
        "inline-flex items-center justify-center font-bold tracking-wider uppercase transition-all duration-300 transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 cursor-pointer select-none";

    // 2. Estilos por Tamaño
    const sizeClasses = {
        sm: "px-4 py-2 text-xs rounded-full gap-2",
        md: "px-6 py-3.5 text-xs sm:text-sm rounded-full gap-2.5",
        lg: "px-8 py-4 text-sm sm:text-base rounded-full gap-3",
    };

    // 3. Estilos por Variante
    const variantClasses = {
        primary:
            "bg-primary text-background hover:bg-secondary hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5",
        secondary:
            "bg-secondary text-background hover:bg-primary hover:shadow-lg hover:shadow-secondary/25 hover:-translate-y-0.5",
        outline:
            "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-background hover:-translate-y-0.5",
        gradient:
            "bg-gradient-to-r from-secondary to-primary hover:from-primary hover:to-text text-background shadow-lg shadow-primary/25 hover:scale-[1.02]",
        ghost:
            "bg-transparent text-text hover:text-secondary hover:translate-x-1 shadow-none focus:ring-0 uppercase-none font-normal",
        white:
            "bg-white text-black hover:bg-black hover:text-white hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-0.5",

    };

    const combinedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim();

    // Contenido interno del botón
    const content = (
        <>
            {text && <span>{text}</span>}
            {children}
        </>
    );

    // Renderizado como Enlace <a>
    if (href) {
        return (
            <a
                href={href}
                className={combinedClasses}
                onClick={onClick}
                target={target}
                rel={target === "_blank" ? rel || "noopener noreferrer" : rel}
            >
                {content}
            </a>
        );
    }

    // Renderizado como Botón <button>
    return (
        <button type={type} className={combinedClasses} onClick={onClick}>
            {content}
        </button>
    );
}