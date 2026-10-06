#!/usr/bin/env node
/**
 * Genera la ficha técnica descargable en PDF.
 *
 *   node scripts/generate-ficha-pdf.mjs
 *
 * Lee src/data/fichas.json (la misma fuente que usa la página
 * /ficha-tecnica) y escribe:
 *
 *   public/fichas-tecnicas/ficha-tecnica-jalsuri.pdf
 *
 * Para actualizar la ficha: edita el JSON y vuelve a ejecutar el script.
 * Si más adelante se diseña una versión gráfica en PDF, basta con
 * reemplazar el archivo resultante manteniendo la misma ruta.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "src", "data", "fichas.json");
const destino = join(
	raiz,
	"public",
	"fichas-tecnicas",
	"ficha-tecnica-jalsuri.pdf",
);

const fichas = JSON.parse(readFileSync(origen, "utf8"));

// --------------------------------------------------------------------------
// Geometría (A4 en puntos)
// --------------------------------------------------------------------------
const ANCHO = 595;
const ALTO = 842;
const MARGEN = 46;
const X_ETIQUETA = MARGEN;
const X_VALOR = 212;
const LIMITE_INFERIOR = 96; // hasta aquí se imprime contenido

// Paleta Jalsuri
const PRIMARIO = [0, 0.518, 1]; // #0084FF
const TEXTO = [0.043, 0.235, 0.451]; // #0B3C73
const GRIS = [0.392, 0.455, 0.545]; // #64748B
const NEGRO = [0.12, 0.16, 0.22];
const CLARO = [0.965, 0.976, 0.988];
const LINEA = [0.87, 0.9, 0.94];
const BLANCO = [1, 1, 1];

// --------------------------------------------------------------------------
// Texto seguro para WinAnsiEncoding (Helvetica) de 1 byte
// --------------------------------------------------------------------------
const MAPA = {
	"₃": "3",
	"₂": "2",
	"₁": "1",
	"—": "-",
	"–": "-",
	"‘": "'",
	"’": "'",
	"“": '"',
	"”": '"',
	"…": "...",
	"•": "-",
	"→": "->",
	"↓": "v",
	"↑": "^",
};

const limpiar = (valor) => {
	let texto = String(valor);
	for (const [origen, reemplazo] of Object.entries(MAPA)) {
		texto = texto.split(origen).join(reemplazo);
	}
	// Fuera de Latin-1 (p. ej. emojis) no existen en la fuente del PDF.
	return texto.replace(/[^\x20-\xff]/g, "?");
};

const escapar = (valor) =>
	limpiar(valor)
		.replace(/\\/g, "\\\\")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)");

const num = (v) => (Math.round(v * 100) / 100).toString();

// Anchos aproximados de Helvetica (en em) para alinear y cortar líneas.
const anchoCaracter = (ch) => {
	if (ch === " ") return 0.278;
	if (/[iljI.,'!|;:]/.test(ch)) return 0.278;
	if (/[ftr()]/.test(ch)) return 0.333;
	if (/[mwMW@]/.test(ch)) return 0.86;
	if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) return 0.7;
	if (/[0-9]/.test(ch)) return 0.556;
	return 0.53;
};

const anchoTexto = (texto, tamano) =>
	Array.from(limpiar(texto)).reduce(
		(total, ch) => total + anchoCaracter(ch),
		0,
	) * tamano;

const cortar = (texto, anchoMax, tamano) => {
	const palabras = limpiar(texto).split(/\s+/);
	const lineas = [];
	let actual = "";
	for (const palabra of palabras) {
		const prueba = actual ? `${actual} ${palabra}` : palabra;
		if (anchoTexto(prueba, tamano) > anchoMax && actual) {
			lineas.push(actual);
			actual = palabra;
		} else {
			actual = prueba;
		}
	}
	if (actual) lineas.push(actual);
	return lineas;
};

// --------------------------------------------------------------------------
// Operadores de contenido
// --------------------------------------------------------------------------
const ops = [];
const color = (c) => c.map((v) => v.toFixed(3)).join(" ");

const rect = (x, y, w, h, c) =>
	ops.push(`${color(c)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);

const regla = (x1, y1, x2, y2, c, grosor = 0.7) =>
	ops.push(
		`${color(c)} RG ${num(grosor)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`,
	);

const texto = (x, y, tamano, tipografia, c, contenido) =>
	ops.push(
		`BT /${tipografia} ${num(tamano)} Tf ${color(c)} rg ${num(x)} ${num(y)} Td (${escapar(contenido)}) Tj ET`,
	);

const textoDerecha = (x, y, tamano, tipografia, c, contenido) =>
	texto(
		x - anchoTexto(contenido, tamano),
		y,
		tamano,
		tipografia,
		c,
		contenido,
	);

const textoCentrado = (x, y, tamano, tipografia, c, contenido) =>
	texto(
		x - anchoTexto(contenido, tamano) / 2,
		y,
		tamano,
		tipografia,
		c,
		contenido,
	);

// --------------------------------------------------------------------------
// Encabezado
// --------------------------------------------------------------------------
rect(0, ALTO - 86, ANCHO, 86, PRIMARIO);
// franja de acento inferior del encabezado
rect(0, ALTO - 90, ANCHO, 4, TEXTO);

texto(
	MARGEN,
	ALTO - 46,
	20,
	"F2",
	BLANCO,
	"FICHA TÉCNICA - AGUA PURIFICADA JALSURI",
);
texto(
	MARGEN,
	ALTO - 66,
	10.5,
	"F1",
	BLANCO,
	"Especificaciones de formato | Agua de mesa ozonizada",
);
textoDerecha(
	ANCHO - MARGEN,
	ALTO - 66,
	10,
	"F1",
	BLANCO,
	`Actualizado: ${limpiar(fichas.actualizado)}`,
);

// --------------------------------------------------------------------------
// Introducción
// --------------------------------------------------------------------------
let y = ALTO - 122;

for (const linea of cortar(fichas.subtitulo, ANCHO - 2 * MARGEN, 10)) {
	texto(MARGEN, y, 10, "F1", GRIS, linea);
	y -= 13.5;
}
y -= 10;

// --------------------------------------------------------------------------
// Fichas
// --------------------------------------------------------------------------
let indice = 0;
ciclo: for (const producto of fichas.productos) {
	if (y < LIMITE_INFERIOR + 40) break;

	// Encabezado del formato: número + nombre + categoría + capacidad
	rect(MARGEN - 1, y - 4, 20, 20, PRIMARIO);
	textoCentrado(MARGEN + 9, y + 2, 10, "F2", BLANCO, producto.orden);
	texto(
		MARGEN + 30,
		y,
		13.5,
		"F2",
		TEXTO,
		`${producto.nombre}  ·  ${producto.categoria}`,
	);
	textoDerecha(
		ANCHO - MARGEN,
		y + 1,
		9.5,
		"F2",
		PRIMARIO,
		producto.capacidad,
	);
	y -= 14;
	regla(MARGEN - 1, y, ANCHO - MARGEN, y, LINEA, 1);
	y -= 15;

	for (const dato of producto.datos) {
		const n = cortar(dato.value, ANCHO - MARGEN - X_VALOR, 9.5).length;
		const altoFila = 18 + (n - 1) * 12;
		if (y - (n - 1) * 12 - 4 < LIMITE_INFERIOR) break ciclo;

		// Banda de fondo alterna para facilitar la lectura
		if (indice % 2 === 0) {
			rect(
				MARGEN - 8,
				y - (n - 1) * 12 - 4,
				ANCHO - 2 * MARGEN + 16,
				15 + (n - 1) * 12,
				CLARO,
			);
		}

		texto(X_ETIQUETA, y, 9, "F2", TEXTO, limpiar(dato.label));
		cortar(dato.value, ANCHO - MARGEN - X_VALOR, 9.5).forEach(
			(linea, i) => {
				texto(X_VALOR, y - i * 12, 9.5, "F1", NEGRO, linea);
			},
		);

		y -= altoFila;
		indice += 1;
	}

	y -= 14;
}

// --------------------------------------------------------------------------
// Pie
// --------------------------------------------------------------------------
regla(MARGEN, 74, ANCHO - MARGEN, 74, LINEA, 1);
texto(
	MARGEN,
	58,
	8.5,
	"F2",
	TEXTO,
	"INGENIERIA APLICADA AGUA S.A.C. | RUC 20563110956 | Lima, Perú",
);
texto(MARGEN, 45, 8.5, "F1", GRIS, "Tel. / WhatsApp: +51 997 673 300");
textoDerecha(
	ANCHO - MARGEN,
	58,
	8.5,
	"F2",
	TEXTO,
	"Registro Sanitario DIGESA | Protocolos HACCP",
);
textoDerecha(
	ANCHO - MARGEN,
	45,
	8.5,
	"F1",
	GRIS,
	"Ficha técnica generada desde el sitio Jalsuri",
);

// --------------------------------------------------------------------------
// Ensamblado del PDF (catálogo, página, fuentes, xref)
// --------------------------------------------------------------------------
const flujo = ops.join("\n");

const objetos = {
	1: "<< /Type /Catalog /Pages 2 0 R >>",
	2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
	3: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>`,
	4: `<< /Length ${Buffer.byteLength(flujo, "latin1")} >>\nstream\n${flujo}\nendstream`,
	5: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	6: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
};

let pdf = "%PDF-1.4\n";
const desplazamientos = {};
const orden = [1, 2, 3, 4, 5, 6];
for (const id of orden) {
	desplazamientos[id] = Buffer.byteLength(pdf, "latin1");
	pdf += `${id} 0 obj\n${objetos[id]}\nendobj\n`;
}
const inicioXref = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${orden.length + 1}\n0000000000 65535 f \n`;
for (const id of orden) {
	pdf += `${String(desplazamientos[id]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${orden.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, Buffer.from(pdf, "latin1"));

console.log(
	`✔ Ficha técnica generada: ${destino.replace(raiz + "/", "")} (${(
		Buffer.byteLength(pdf, "latin1") / 1024
	).toFixed(1)} KB)`,
);
