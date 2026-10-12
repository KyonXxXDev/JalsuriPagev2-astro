import { Canvas, invalidate, useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "@react-three/drei";

// ---------------------------------------------------------------------------
// AJUSTES DEL MODELO (edita aquí para mover / encuadrar)
// Unidades normalizadas: el modelo se escala para medir ALTURA_OBJETIVO de alto.
// ---------------------------------------------------------------------------
const CONFIG = {
	fov: 32,
	altura: 1.2, // tamaño del modelo
	camZ: { escritorio: 3.4, movil: 5.8 }, // distancia de la cámara
	baseY: { escritorio: 0, movil: 0.2 }, // anclaje vertical
	inicioY: { escritorio: 0.16, movil: 0.28 }, // posición en Sección 1
	finY: { escritorio: -0.1, movil: 0.06 }, // posición en Sección 2
	rotInicio: -0.45, // vista 3/4 inicial (rad)
	lean: -0.18, // inclinación "héroe" (rad)
	vueltas: 1, // vueltas completas en el recorrido
	envIntensidad: 0.75,
};

const esGrande = () => window.matchMedia("(min-width: 1024px)").matches;
const pick = (v: { escritorio: number; movil: number }) =>
	esGrande() ? v.escritorio : v.movil;

type Props = { modelos: string[] };

type Progreso = { current: number };

function Luces() {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);

	useEffect(() => {
		const pmrem = new THREE.PMREMGenerator(gl);
		const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		scene.environment = tex;
		scene.environmentIntensity = CONFIG.envIntensidad;
		invalidate();
		return () => {
			scene.environment = null;
			tex.dispose();
			pmrem.dispose();
		};
	}, [gl, scene]);

	return (
		<>
			<directionalLight position={[2.6, 4, 3.4]} intensity={2} />
			<directionalLight
				position={[-3.4, 1.4, 2.6]}
				intensity={0.9}
				color={0xdcf3ff}
			/>
			<directionalLight position={[0, 3, -4]} intensity={1.3} />
			<ambientLight intensity={0.35} />
		</>
	);
}

function Modelo({
	modelos,
	progreso,
	onEstado,
}: {
	modelos: string[];
	progreso: Progreso;
	onEstado: (e: "listo" | "error") => void;
}) {
	const gl = useThree((s) => s.gl);
	const camera = useThree((s) => s.camera);
	const [objeto, setObjeto] = useState<THREE.Object3D | null>(null);
	const inclinado = useRef<THREE.Group>(null!);
	const pivote = useRef<THREE.Group>(null!);

	useEffect(() => {
		const draco = new DRACOLoader();
		draco.setDecoderPath("/draco/");
		const ktx2 = new KTX2Loader().detectSupport(gl);
		const loader = new GLTFLoader();
		loader.setDRACOLoader(draco);
		loader.setKTX2Loader(ktx2);

		let cancelado = false;
		let i = 0;
		const intentar = () => {
			if (i >= modelos.length) return onEstado("error");
			loader.load(
				modelos[i++],
				(gltf) => {
					if (cancelado) return;
					const caja = new THREE.Box3().setFromObject(gltf.scene);
					const tam = caja.getSize(new THREE.Vector3());
					const centro = caja.getCenter(new THREE.Vector3());
					const escala = CONFIG.altura / Math.max(tam.y, 0.0001);
					const interior = new THREE.Group();
					interior.add(gltf.scene);
					interior.scale.setScalar(escala);
					interior.position.copy(centro).multiplyScalar(-escala);
					setObjeto(interior);
					onEstado("listo");
					invalidate();
				},
				undefined,
				() => !cancelado && intentar(),
			);
		};
		intentar();

		return () => {
			cancelado = true;
			draco.dispose();
			ktx2.dispose();
		};
	}, [gl, modelos]);

	// Aplica el progreso del scroll (0 → Sección 1, 1 → Sección 2)
	useFrame(() => {
		if (!inclinado.current || !pivote.current) return;
		const p = Math.max(0, Math.min(1, progreso.current));
		const ease = p * p * (3 - 2 * p);
		const y =
			pick(CONFIG.inicioY) +
			(pick(CONFIG.finY) - pick(CONFIG.inicioY)) * ease;
		inclinado.current.position.y = pick(CONFIG.baseY) + y;
		inclinado.current.rotation.z = CONFIG.lean * (1 - 2 * ease);
		pivote.current.rotation.y =
			CONFIG.rotInicio + Math.PI * 2 * CONFIG.vueltas * p;
	});

	useEffect(() => () => {
		objeto?.traverse((o) => {
			const m = o as THREE.Mesh;
			m.geometry?.dispose();
			const mat = m.material as THREE.Material | THREE.Material[] | undefined;
			if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
			else mat?.dispose();
		});
	}, [objeto]);

	return (
		<group ref={inclinado}>
			<group ref={pivote}>{objeto && <primitive object={objeto} />}</group>
		</group>
	);
}

export default function Viewer3DCanvas({ modelos }: Props) {
	const progreso = useRef<number>(0);
	const wrapper = useRef<HTMLDivElement>(null);

	// Estado de la UI del contenedor Astro (poster, badges, carga)
	const onEstado = (estado: "listo" | "error") => {
		const cont = wrapper.current?.closest<HTMLElement>("[data-viewer-3d]");
		if (!cont) return;
		const carga = cont.querySelector<HTMLElement>("[data-carga]");
		if (carga) carga.style.opacity = "0";
		const poster = cont.querySelector<HTMLElement>(".poster");
		if (estado === "listo") {
			if (poster) poster.style.opacity = "0";
			cont.querySelector("[data-badge-ref]")?.classList.add("hidden");
		}
	};

	// Expone la API que usa ficha-tecnica.astro
	useEffect(() => {
		const cont = wrapper.current?.closest<HTMLElement>("[data-viewer-3d]");
		if (!cont) return;
		(cont as any).actualizarProgreso3D = (p: number) => {
			progreso.current = p;
			const poster = cont.querySelector<HTMLElement>(".poster");
			if (poster) {
				poster.style.transform = `translate3d(0, ${(p - 0.5) * 40}px, 0)`;
			}
			invalidate();
		};
	}, []);

	return (
		<div
			ref={wrapper}
			className="absolute inset-0 w-full h-full pointer-events-auto"
			aria-hidden="true"
		>
			<Canvas
				frameloop="demand"
				dpr={[1, 2]}
				gl={{
					antialias: true,
					alpha: true,
					powerPreference: "high-performance",
					toneMapping: THREE.ACESFilmicToneMapping,
					toneMappingExposure: 1,
				}}
				camera={{
					fov: CONFIG.fov,
					near: 0.05,
					far: 50,
					position: [0, 0, pick(CONFIG.camZ)],
				}}
				onCreated={({ gl, scene }) => {
					gl.setClearColor(0x000000, 0);
					scene.background = null;
				}}
				style={{ pointerEvents: "auto", background: "transparent" }}
			>
				<OrbitControls enableZoom={false} enablePan={false} />
				<Luces />
				<Modelo
					modelos={modelos}
					progreso={progreso}
					onEstado={onEstado}
				/>
			</Canvas>
		</div>
	);
}
