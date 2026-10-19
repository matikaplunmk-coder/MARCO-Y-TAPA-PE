import type { NumField } from '../engine/paramSchema';
import NumberField from './NumberField';
import { Accordion } from './ui';

interface Props<P> {
  fields: NumField<P, string>[];
  params: P;
  onSet: (key: string, v: number) => void;
}

/** Lista de campos numéricos de un grupo: principales y bloque «Avanzado» */
export default function FieldList<P>({ fields, params, onSet }: Props<P>) {
  const render = (f: NumField<P, string>) => {
    if (f.visible && !f.visible(params)) return null;
    return (
      <NumberField
        key={f.key}
        field={f}
        value={(params as Record<string, number>)[f.key]}
        disabled={f.disabled?.(params)}
        onChange={(v) => onSet(f.key, v)}
      />
    );
  };
  const main = fields.filter((f) => !f.advanced);
  const adv = fields.filter((f) => f.advanced && (!f.visible || f.visible(params)));
  return (
    <>
      {main.map(render)}
      {adv.length > 0 &&
        (main.length > 0 ? (
          <Accordion nested title="Avanzado / calibración" badge={`${adv.length}`}>
            {adv.map(render)}
          </Accordion>
        ) : (
          adv.map(render)
        ))}
    </>
  );
}
