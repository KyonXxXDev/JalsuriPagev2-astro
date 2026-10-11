interface SectionHeaderProps {
    highlight: string;
    suffix: string;
}

export function SectionHeader({ highlight, suffix }: Readonly<SectionHeaderProps>) {
    return (
        <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 font-display tracking-tight text-center mb-8">
            <span className="text-transparent bg-clip-text bg-linear-to-r from-primary to-secondary">
                {highlight}
            </span>{" "}
            {suffix}
        </h2>
    );
}
