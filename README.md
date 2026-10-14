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
| `src/engine/presets.ts` | Exportar / importar presets JSON con validación |
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
