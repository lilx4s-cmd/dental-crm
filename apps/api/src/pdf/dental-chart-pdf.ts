import { Svg, Path, Circle, Rect, Line, G, Text as SvgText } from '@react-pdf/renderer';
import React from 'react';
import {
  ARCH_WIDTH,
  LAYOUT,
  LOWER_TEETH,
  PALETTE,
  UPPER_TEETH,
  buildBone,
  buildGumPath,
  buildTooth,
  buildToothMarker,
  slotCenterX,
  type ChartMode,
  type DrawOp,
  type ToothCondition,
} from '@dental-crm/shared';

// Draws the dental arch into a PDF from the same geometry the web app renders, so what a patient
// reads on paper and what they see in the portal cannot drift apart. Only the mapping from draw op
// to element differs between the two.

function ops(list: DrawOp[], keyPrefix: string): React.ReactElement[] {
  return list.map((op, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (op.kind) {
      case 'path':
        return React.createElement(Path, {
          key,
          d: op.d,
          fill: op.fill ?? 'none',
          stroke: op.stroke,
          strokeWidth: op.strokeWidth,
          opacity: op.opacity,
        });
      case 'circle':
        return React.createElement(Circle, {
          key,
          cx: op.cx,
          cy: op.cy,
          r: op.r,
          fill: op.fill,
          stroke: op.stroke,
          strokeWidth: op.strokeWidth,
        });
      case 'rect':
        return React.createElement(Rect, {
          key,
          x: op.x,
          y: op.y,
          width: op.width,
          height: op.height,
          rx: op.rx,
          fill: op.fill,
          stroke: op.stroke,
          strokeWidth: op.strokeWidth,
          opacity: op.opacity,
        });
      case 'line':
        return React.createElement(Line, {
          key,
          x1: op.x1,
          y1: op.y1,
          x2: op.x2,
          y2: op.y2,
          stroke: op.stroke,
          strokeWidth: op.strokeWidth,
          opacity: op.opacity,
        });
    }
  });
}

function arch(
  teeth: string[],
  conditions: Record<string, ToothCondition>,
  mode: ChartMode,
  upper: boolean,
): React.ReactElement {
  const recession: Record<number, boolean> = {};
  const edentulous: Record<number, boolean> = {};
  teeth.forEach((t, i) => {
    if (conditions[t] === 'RECEDING_BONE') recession[i] = true;
    if (conditions[t] === 'MISSING') edentulous[i] = true;
  });

  const layers = teeth.map((t) => buildTooth(t, conditions[t] ?? 'HEALTHY', mode));
  const gumY = upper ? LAYOUT.upperGumY : LAYOUT.lowerGumY;
  const labelY = upper ? LAYOUT.upperLabelY : LAYOUT.lowerLabelY;

  return React.createElement(
    G,
    { key: upper ? 'upper' : 'lower' },
    // The whole arch is mirrored for the upper jaw, which is why the tooth numbers are drawn
    // outside this group — mirrored text would come out upside down.
    React.createElement(
      G,
      { transform: upper ? `translate(0, ${gumY}) scale(1, -1)` : `translate(0, ${gumY})` },
      ...ops(buildBone(upper ? 11 : 29), `${upper ? 'u' : 'l'}-bone`),
      ...layers.map((layer, i) =>
        React.createElement(
          G,
          { key: `sub-${teeth[i]}`, transform: `translate(${slotCenterX(i)}, 0)` },
          ...ops(layer.subgingival, `sub-${teeth[i]}`),
        ),
      ),
      React.createElement(Path, {
        key: 'gum',
        d: buildGumPath(teeth.length, recession, edentulous),
        fill: PALETTE.gum,
      }),
      ...layers.map((layer, i) =>
        React.createElement(
          G,
          { key: `sup-${teeth[i]}`, transform: `translate(${slotCenterX(i)}, 0)` },
          ...ops(layer.supragingival, `sup-${teeth[i]}`),
          ...ops(buildToothMarker(conditions[teeth[i]] ?? 'HEALTHY', mode), `mark-${teeth[i]}`),
        ),
      ),
    ),
    ...teeth.map((tooth, i) =>
      React.createElement(
        SvgText,
        {
          key: `label-${tooth}`,
          x: slotCenterX(i),
          y: labelY,
          textAnchor: 'middle',
          fill: '#71717a',
          style: { fontSize: 17 },
        },
        tooth,
      ),
    ),
  );
}

export function DentalChartPdf({
  conditions,
  mode,
  width,
}: {
  conditions: Record<string, ToothCondition>;
  mode: ChartMode;
  width: number;
}): React.ReactElement {
  const height = (width * LAYOUT.height) / ARCH_WIDTH;
  return React.createElement(
    Svg,
    { viewBox: `0 0 ${ARCH_WIDTH} ${LAYOUT.height}`, width, height },
    arch(UPPER_TEETH, conditions, mode, true),
    React.createElement(Line, {
      key: 'midline',
      x1: ARCH_WIDTH / 2,
      y1: 0,
      x2: ARCH_WIDTH / 2,
      y2: LAYOUT.height,
      stroke: '#d4d4d8',
      strokeWidth: 1,
    }),
    arch(LOWER_TEETH, conditions, mode, false),
  );
}
