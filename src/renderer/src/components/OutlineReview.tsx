import { useState } from "react";
import { UNITS_MIN } from "../../../shared/limits";
import type { Unit } from "../../../shared/types";

type Props = { units: Unit[]; onAccept(units: Unit[]): void };

export function OutlineReview(props: Props) {
  const [units, setUnits] = useState<Unit[]>(props.units);

  function change(i: number, patch: Partial<Unit>) {
    setUnits((list) => list.map((u, k) => (k === i ? { ...u, ...patch } : u)));
  }
  function move(i: number, by: number) {
    setUnits((list) => {
      const next = list.slice();
      const [u] = next.splice(i, 1);
      next.splice(i + by, 0, u);
      return next;
    });
  }
  function remove(i: number) {
    setUnits((list) => list.filter((_, k) => k !== i));
  }

  const incomplete = units.some((u) => u.title.trim() === "" || u.goal.trim() === "");

  return (
    <div>
      {units.map((u, i) => (
        <div className="unit-row" key={u.id}>
          <b>{i + 1}</b>
          <div className="field">
            <input
              aria-label={`Title of unit ${i + 1}`}
              value={u.title}
              onChange={(e) => change(i, { title: e.target.value })}
            />
            <textarea
              aria-label={`Goal of unit ${i + 1}`}
              value={u.goal}
              onChange={(e) => change(i, { goal: e.target.value })}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="icon-btn"
              aria-label="Move up"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Move down"
              disabled={i === units.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove unit"
            disabled={units.length <= UNITS_MIN}
            onClick={() => remove(i)}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn is-primary"
        disabled={incomplete}
        onClick={() => props.onAccept(units)}
      >
        Accept outline
      </button>
    </div>
  );
}
