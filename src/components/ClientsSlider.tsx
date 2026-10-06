
import { useCallback, useEffect, useMemo, useRef } from "react";
// Image replaced by <img>
import { ChevronLeft, ChevronRight } from "lucide-react";

const REPETICIONES = 3;
const VELOCIDAD_PX_POR_SEG = 100; // restaurado: 10 lo hacía casi imperceptible
const MAX_DT_MS = 100;

import gsap from "gsap";
import { ScrollTrigger } from "gsap/all";
import { clients } from "./texts";
import { SectionHeader } from "./general/section-header";

if (typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
}

export default function BrandClientes() {
    const sectionRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    const posX = useRef(0);
    const setWidth = useRef(0);

    // Estados de control para las interacciones
    const isDragging = useRef(false);
    const isPaused = useRef(false);
    const isAnimatingManualMove = useRef(false); // Previene múltiples clics rápidos

    const dragStartClientX = useRef(0);
    const dragStartPos = useRef(0);
    const rafId = useRef<number | null>(null);
    const lastFrameTime = useRef(0);

    useEffect(() => {
        gsap.fromTo(
            sectionRef.current,
            {
                y: 50,
                opacity: 0.2,
            },
            {
                y: 0,
                opacity: 1,
                ease: "none",
                scrollTrigger: {
                    trigger: sectionRef.current,
                    start: "top 80%",
                    end: "top 85%",
                    scrub: 0.1,
                },
            }
        );
    }, []);

    // 3 copias para lograr el scroll infinito
    const items = useMemo(
        () =>
            Array.from({ length: REPETICIONES }).flatMap((_, copia) =>
                clients.map((empresa) => ({
                    ...empresa,
                    key: `${copia}-${empresa.id}`,
                }))
            ),
        []
    );

    const quantity = items.length;

    const getVisibleItems = useCallback(() => {
        if (typeof window === "undefined") return 2;
        if (window.innerWidth >= 1024) return 5;
        if (window.innerWidth >= 768) return 4;
        if (window.innerWidth >= 640) return 3;
        return 2;
    }, []);

    const applyTransform = useCallback(() => {
        if (trackRef.current) {
            trackRef.current.style.transform = `translate3d(${posX.current}px,0,0)`;
        }
    }, []);

    const normalize = useCallback(() => {
        const w = setWidth.current;
        if (w <= 0) return;
        while (posX.current <= -2 * w) posX.current += w;
        while (posX.current > 0) posX.current -= w;
    }, []);

    const measure = useCallback(() => {
        if (!trackRef.current || !viewportRef.current) return;

        const visibleItems = getVisibleItems();
        const containerWidth = viewportRef.current.clientWidth;
        const itemWidth = containerWidth / visibleItems;

        viewportRef.current.style.setProperty("--item-width", `${itemWidth}px`);

        const w = itemWidth * clients.length;
        setWidth.current = w;

        if (posX.current === 0) {
            posX.current = -w;
        }
        normalize();
        applyTransform();
    }, [normalize, applyTransform, getVisibleItems]);

    useEffect(() => {
        measure();
        const ro = new ResizeObserver(() => measure());
        if (viewportRef.current) ro.observe(viewportRef.current);
        window.addEventListener("resize", measure);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", measure);
        };
    }, [measure]);

    useEffect(() => {
        const tick = (time: number) => {
            if (lastFrameTime.current === 0) lastFrameTime.current = time;
            const dt = Math.min(time - lastFrameTime.current, MAX_DT_MS);
            lastFrameTime.current = time;

            // Solo avanza automáticamente si no estamos arrastrando, pausados por hover, ni haciendo click en un botón
            if (!isDragging.current && !isPaused.current && !isAnimatingManualMove.current) {
                posX.current -= (VELOCIDAD_PX_POR_SEG / 1000) * dt;
                normalize();
                applyTransform();
            }
            rafId.current = requestAnimationFrame(tick);
        };
        rafId.current = requestAnimationFrame(tick);
        return () => {
            if (rafId.current !== null) cancelAnimationFrame(rafId.current);
        };
    }, [normalize, applyTransform]);

    // =========================================
    // EVENTOS DE DRAG & DROP
    // =========================================
    const onPointerDown = (e: React.PointerEvent) => {
        isDragging.current = true;
        dragStartClientX.current = e.clientX;
        dragStartPos.current = posX.current;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        const delta = e.clientX - dragStartClientX.current;
        posX.current = dragStartPos.current + delta;
        normalize();
        applyTransform();
    };

    const endDrag = () => {
        isDragging.current = false;
    };

    // =========================================
    // ANIMACIÓN MANUAL (BOTONES)
    // =========================================
    const handleManualMove = (direction: number) => {
        if (!viewportRef.current || isAnimatingManualMove.current) return;

        isAnimatingManualMove.current = true; // Bloquea clics dobles rápidos

        const itemWidth = viewportRef.current.clientWidth / getVisibleItems();
        const startPos = posX.current;
        const endPos = startPos + (direction * itemWidth);
        const startTime = performance.now();
        const duration = 400; // Duración del deslizamiento en ms

        const animateMove = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Efecto Easing (easeOutCubic) para que frene suavemente
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            posX.current = startPos + (endPos - startPos) * easeProgress;
            normalize();
            applyTransform();

            if (progress < 1) {
                requestAnimationFrame(animateMove);
            } else {
                isAnimatingManualMove.current = false; // Libera el botón
            }
        };
        requestAnimationFrame(animateMove);
    };

    return (
        <section ref={sectionRef} className="w-full">
            <div className="w-full py-12 px-6 lg:px-12 flex flex-col items-center text-black anim-section">
                <SectionHeader highlight="Marcas que confían" suffix="en nosotros" />
                <div className="flex items-center w-full gap-4 lg:gap-6">
                    <button
                        type="button"
                        onClick={() => handleManualMove(1)}
                        className="z-20 flex size-10 lg:size-12 shrink-0 items-center justify-center bg-secondary text-white rounded-xl transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 cursor-pointer"
                        aria-label="Anterior"
                    >
                        <ChevronLeft className="h-5 w-5 lg:h-6 lg:w-6" />
                    </button>
                    {/* Contenedor principal con la máscara de degradado en las esquinas */}
                    <div
                        ref={viewportRef}
                        className="img_slider relative w-full h-24 overflow-hidden"
                        onPointerEnter={() => (isPaused.current = true)}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onPointerLeave={() => {
                            isPaused.current = false;
                            endDrag();
                        }}
                        style={{ scrollBehavior: "smooth", scrollSnapType: "x mandatory", touchAction: "pan-y" }}
                    >
                        <div
                            className="relative w-full h-full flex items-center select-none cursor-grab active:cursor-grabbing will-change-transform"
                            ref={trackRef}
                            style={{
                                "--quantity": quantity,
                                animation: "none",
                            } as React.CSSProperties}
                        >
                            {items.map((empresa, index) => (
                                <div
                                    key={empresa.key}
                                    className="slider_item absolute flex shrink-0 items-center justify-center p-2"
                                    style={{ "--position": index + 1 } as React.CSSProperties}
                                >
                                    <div className="w-full h-16 flex items-center justify-center">
                                        <img
                                            src={empresa.logo}
                                            alt={empresa.label}
                                            draggable={false}
                                            className="max-h-12 sm:max-h-16 w-auto object-contain transition-all duration-300 pointer-events-none"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleManualMove(-1)}
                        className="z-10 flex size-10 lg:size-12 shrink-0 items-center justify-center bg-secondary text-white rounded-xl transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 cursor-pointer"
                        aria-label="Siguiente"
                    >
                        <ChevronRight className="h-5 w-5 lg:h-6 lg:w-6" />
                    </button>
                </div>

            </div>
        </section>
    );
}