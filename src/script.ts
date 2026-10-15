import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let cleanup: (() => void) | undefined;

function initTimelinePanels() {
    cleanup?.();
    cleanup = undefined;

    const section = document.querySelector<HTMLElement>("#trayectoria");
    const wrapper = document.querySelector<HTMLElement>(
        "#trayectoria-wrapper",
    );
    const container = document.querySelector<HTMLElement>(
        "#panels-container",
    );
    const panels = gsap.utils.toArray<HTMLElement>(
        "#panels-container .panel",
    );
    const buttons = gsap.utils.toArray<HTMLButtonElement>(
        ".timeline-step-btn",
    );

    if (!section || !wrapper || !container || panels.length < 2) return;

    const totalPanels = panels.length;
    const ctx = gsap.context(() => {
        let activeIndex = -1;

        // Medir el desplazamiento horizontal real.
        const getDistance = () =>
            Math.max(0, container.scrollWidth - wrapper.clientWidth);

        // Mover el contenedor completo, no cada panel individual.
        const horizontalTween = gsap.to(container, {
            x: () => -getDistance(),
            ease: "none",
            scrollTrigger: {
                id: "trayectoria-horizontal",
                trigger: wrapper,
                pin: wrapper,
                start: "top top",
                end: () => `+=${getDistance()}`,
                scrub: 0.6,
                anticipatePin: 1,
                invalidateOnRefresh: true,

                snap: {
                    snapTo: (progress) => {
                        const steps = totalPanels - 1;
                        return Math.round(progress * steps) / steps;
                    },
                    duration: { min: 0.15, max: 0.35 },
                    ease: "power1.inOut",
                },

                onUpdate: (self) => {
                    const progress = self.progress;

                    const bar = document.querySelector<HTMLElement>(
                        "#timeline-progress-bar",
                    );

                    if (bar) {
                        bar.style.width = `${progress * 100}%`;
                    }

                    const index = Math.min(
                        totalPanels - 1,
                        Math.round(progress * (totalPanels - 1)),
                    );

                    if (index === activeIndex) return;
                    activeIndex = index;

                    buttons.forEach((button, i) => {
                        const isActive = i === index;

                        button.classList.toggle("bg-primary", isActive);
                        button.classList.toggle("text-white", isActive);
                        button.classList.toggle(
                            "shadow-sm",
                            isActive,
                        );
                        button.classList.toggle(
                            "shadow-primary/30",
                            isActive,
                        );

                        button.classList.toggle(
                            "text-slate-500",
                            !isActive,
                        );
                        button.setAttribute(
                            "aria-current",
                            isActive ? "step" : "false",
                        );
                    });

                    const counter = document.querySelector<HTMLElement>(
                        "#timeline-step-counter",
                    );

                    if (counter) {
                        counter.textContent =
                            `${String(index + 1).padStart(2, "0")} / ` +
                            `${String(totalPanels).padStart(2, "0")}`;
                    }
                },
            },
        });

        // Navegación directa a cada hito.
        buttons.forEach((button) => {
            const handleClick = () => {
                const index = Number(button.dataset.stepIndex ?? 0);
                const trigger = horizontalTween.scrollTrigger;

                if (!trigger) return;

                const progress = index / (totalPanels - 1);
                const target = trigger.start +
                    (trigger.end - trigger.start) * progress;

                // Compatible con Lenis cuando está integrado con GSAP.
                gsap.to(window, {
                    scrollTo: { y: target, autoKill: true },
                    duration: 0.8,
                    ease: "power2.out",
                });
            };

            button.addEventListener("click", handleClick);

            listeners.push(() => {
                button.removeEventListener("click", handleClick);
            });
        });
    }, section);

    function refresh() {
        ScrollTrigger.refresh();
    }

    const listeners: Array<() => void> = [];

    // Esperar a que el navegador calcule el layout.
    requestAnimationFrame(() => {
        ScrollTrigger.refresh();
    });

    window.addEventListener("resize", refresh);

    cleanup = () => {
        listeners.forEach((remove) => remove());
        window.removeEventListener("resize", refresh);
        ctx.revert();
    };
}

document.addEventListener("astro:page-load", initTimelinePanels);
document.addEventListener("astro:before-swap", () => {
    cleanup?.();
    cleanup = undefined;
});

// Primera carga y navegación de Astro.
if (document.readyState !== "loading") {
    initTimelinePanels();
} else {
    document.addEventListener(
        "DOMContentLoaded",
        initTimelinePanels,
        { once: true },
    );
}

