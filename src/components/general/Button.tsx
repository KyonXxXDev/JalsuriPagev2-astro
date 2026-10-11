interface ButtonProps {
    text: string;
    href?: string;
    onClick?: () => void;
    className?: string;
    variant?: "primary" | "secondary" | "outline";
    children?: React.ReactNode;
    type?: "button" | "submit" | "reset";
}

export default function Button({
    text,
    href,
    onClick,
    className = "",
    variant = "primary",
    children,
    type = "button",
}: Readonly<ButtonProps>) {
    // Clases base compartidas
    const baseClasses =
        "inline-flex items-center justify-center gap-3 px-6 py-3.5 sm:px-8 sm:py-4 rounded-full font-bold text-xs sm:text-sm tracking-wider uppercase transition-all duration-300 transform active:scale-95 shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary/50 cursor-pointer";
    
    // Estilos según la variante basada en tus variables CSS y tema
    const variantClasses = {
        primary:
            "bg-primary text-background hover:bg-secondary hover:shadow-lg hover:shadow-primary/25 hover:-translate-y-1",
        secondary:
            "bg-secondary text-background hover:bg-primary hover:shadow-lg hover:shadow-secondary/25 hover:-translate-y-1",
        outline:
            "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-background hover:-translate-y-1 shadow-none",
    };

    const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${className}`.trim();

    // Si tiene href se renderiza como enlace <a>
    if (href) {
        return (
            <a href={href} className={combinedClasses} onClick={onClick}>
                <span>{text}</span>
                {children}
            </a>
        );
    }

    // Si no tiene href se renderiza como <button>
    return (
        <button type={type} className={combinedClasses} onClick={onClick}>
            <span>{text}</span>
            {children}
        </button>
    );
}