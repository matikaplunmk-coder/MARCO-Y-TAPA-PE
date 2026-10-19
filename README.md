# Simulador de planta · marcos y tapas de registro (PEAD + fibra de vidrio)

Aplicación React + Vite + TypeScript + Tailwind CSS + Lucide para simular y optimizar una planta de moldeo por
compresión con **cierre mecánico desacoplado** de marcos y tapas de registro (UNE-EN 124, clases D400 / C250).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de producción
```

## Estructura

| Ruta | Contenido |
| --- | --- |
| `src/types/simulation.ts` | Interfaces: piezas, parámetros, segmentos DES, resultados, alertas |
| `src/engine/parts.ts` | Presets de pieza y **valores de fábrica** de todos los parámetros |
| `src/engine/paramSchema.ts` | Esquema de campos editables (rangos de slider y límites duros) |
| `src/engine/presets.ts` | Importación validada del preset del Método A (formato v1) |
| `src/engine/appPresets.ts` | Preset v2: Método A + Método B + costos (acepta también v1) |
| `src/engine/rheology.ts` | Método B: viscosidad (ley de potencias + MFI), atrición de fibra, ΔP en bebedero y cavidad |
| `src/engine/intrusionMechanics.ts` | Método B: Halpin-Tsai con A_f real y PE-g-MA, Kelly-Tyson, jaula de acero |
| `src/engine/intrusionDES.ts` | Método B: DES con manifold en T, operarios, polipasto y batea |
| `src/engine/intrusionEngine.ts` | Método B: orquestación (reología → térmico → DES → EN 124 → alertas) |
| `src/engine/economics.ts` | Costo unitario por pieza buena con amortización |
| `src/engine/compareCurves.ts` | Curvas carga–flecha de ambos métodos |
| `src/engine/thermalPhysics.ts` | Conducción 1D transitoria (implícito, Thomas) con calor de cristalización, Maxwell, contracción y alabeo |
| `src/engine/mechanicalPhysics.ts` | Halpin-Tsai/Tsai-Pagano (regla de mezclas), placa nervada, ensayo EN 124 (flecha permanente y rotura) |
| `src/engine/processModel.ts` | Tonelaje requerido, llenado, rechupes, UV, rendimiento de calidad |
| `src/engine/simulationEngine.ts` | Simulación de eventos discretos del circuito completo con N moldes |
| `src/engine/analysis.ts` | Orquestación: OEE, cuello de botella, alertas |
| `src/components/PlantCanvas.tsx` | Layout SVG animado (extrusor, prensa, grúa, batea, desmoldeo), moldes coloreados por temperatura |
| `src/components/ControlPanel.tsx` | Sliders y selectores en tiempo real |
| `src/components/MetricsPanel.tsx` | Tacómetros, curva de enfriamiento, utilización, EN 124, alertas |

## Modelo (resumen y limitaciones)

* **DES**: Extrusor (acumulador de 1 masa) → carga → prensado + enroscado → apertura → grúa → batea (S posiciones)
  → grúa → desmoldeo (M estaciones) → retorno. La prensa queda retenida si no hay grúa o posición libre en batea.
  La ventana de medición excluye las 2 primeras horas (arranque).
* **Térmico**: media placa de espesor crítico con convección equivalente (acero + holgura + agua). Fases: prensa
  (molde a 60 °C) → traslado en aire → batea. Con el valor por defecto (32 mm, agua a 20 °C) el núcleo baja de 50 °C en ≈ 21 min.
* **Mecánico**: sección en T equivalente, placa circular con apoyo parcialmente empotrado y carga repartida;
  factores de reparto y fluencia **calibrados cualitativamente**: sirven para comparar formulaciones y geometrías,
  no sustituyen el ensayo normativo ni un análisis por elementos finitos.
* **OEE** = disponibilidad fija (92 %) × rendimiento (ritmo real / capacidad de prensa) × calidad estimada.

## Modo sandbox

Todas las variables del proceso (≈ 110) viven en `ProcessParams` y se editan desde el panel (slider + campo numérico con
límites duros; los campos de calibración están en bloques «Avanzado»). «Exportar preset JSON» descarga la
configuración; «Cargar preset JSON» la valida (claves desconocidas ignoradas, números limitados a su rango, lo que falte
toma el valor de fábrica). Solo quedan fijas la discretización numérica del modelo térmico (41 nodos, paso de 1 s),
los pesos internos del índice de rechupes y las constantes de unidades.

## Despliegue en Vercel

`vercel.json` ya contiene la reescritura SPA. Vercel detecta Vite automáticamente
(Build Command `npm run build`, Output Directory `dist`):

1. Importar el repositorio en https://vercel.com/new (rama `claude/quirky-hamilton-5o5wmr` o `main` tras fusionar).
2. Dejar los ajustes detectados y pulsar *Deploy*.

O por CLI: `npm i -g vercel && vercel --prod`.

## Método B y vista comparativa

La barra superior tiene tres vistas: **Método A** (compresión desacoplada), **Método B** (intrusión directa con manifold
en «T») y **Comparativa A vs B**. El panel lateral tiene cuatro paneles (Pieza, Método A, Método B, Costos) y las acciones rápidas
(restablecer, exportar y cargar preset JSON, que guarda **todas** las variables de ambos métodos y los costos).

Modelo del Método B (simplificado, calibrado cualitativamente):

* **Atrición de fibra:** `L = L₀·exp(−k·RPM·(L/D)/η_rel)`; con Side Feeder solo cuenta el L/D recorrido tras la boca de alimentación.
  La RPM se deduce del caudal y del diámetro del husillo; η_rel es la viscosidad en el canal (ley de potencias calibrada con el MFI) relativa a una referencia.
* **Compuesto:** Halpin-Tsai con la relación de aspecto real `A_f = L/d` y fibra efectiva reducida por la eficiencia de interfase (20 % sin PE-g-MA);
  resistencia por Kelly-Tyson (longitud crítica según cizalla interfacial).
* **Presión:** bebedero cónico en ley de potencias + flujo radial en la cavidad; alerta de sobrepresión, venteo (0,03–0,06 mm) y apertura de molde.
* **Jaula de acero:** sección transformada (rigidez) y rotura por fluencia del acero más aporte del compuesto; añade su masa a la pieza.
* **DES:** el extrusor atiende los puestos por orden de llegada, con tiempo de conmutación; queda «bloqueado» si no hay molde listo y apernado.
  Enfriamiento in-situ o con polipasto a batea; operarios como recurso compartido.
* **Costos:** valores de referencia editables (USD); amortización lineal a N años sobre piezas buenas.
