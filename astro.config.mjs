// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

export default defineConfig({
	integrations: [react()],
	vite: {
		plugins: [tailwindcss()],
		optimizeDeps: {
			include: [
				'three',
				'three/examples/jsm/loaders/GLTFLoader.js',
				'three/examples/jsm/loaders/DRACOLoader.js',
				'three/examples/jsm/loaders/KTX2Loader.js',
				'three/examples/jsm/environments/RoomEnvironment.js',
				'three/examples/jsm/controls/OrbitControls.js',
			],
		},
	},
});

