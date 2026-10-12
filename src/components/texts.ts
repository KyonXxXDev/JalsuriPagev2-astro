// Placeholder: reemplaza con los logos reales de tus clientes.
// Coloca los archivos en /public/clients/ y actualiza las rutas.
export interface Client {
    id: number;
    label: string;
    logo: string;
}

export const clients: Client[] = [
    { id: 1, label: "Hudbay", logo: "/logo.svg" },
    { id: 2, label: "Anglo American", logo: "/logo.svg" },
    { id: 3, label: "Boroo", logo: "/logo.svg" },
    { id: 4, label: "Cerro Verde", logo: "/logo.svg" },
    { id: 5, label: "Miski Mayo", logo: "/logo.svg" },
    { id: 6, label: "Southern Copper", logo: "/logo.svg" },
    { id: 7, label: "Antapaccay", logo: "/logo.svg" },
];

export const navLinks = [
    { href: "#hero-container", label: "Inicio" },
    { href: "#compromiso", label: "Nosotros" },
    { href: "#productos", label: "Productos" },
    { href: "#calidad", label: "Calidad" },
    { href: "#trayectoria", label: "Línea de Tiempo" },
    { href: "#contacto", label: "Contacto" },
];

export const soluciones = [
    { label: "Bidones de 20 Litros" },
    { label: "Botellas Personales" },
    { label: "Maquila de Agua" },
    { label: "Atención Corporativa" },
];


export const contacto = {
    numero: "519",
};