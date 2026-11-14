import { useId } from "react";
import { CLI_ORDER, cliName } from "../../../shared/clis";
import type { CliId, CliStatus } from "../../../shared/types";

type Props = {
  statuses: CliStatus[];
  value: CliId | null;
  disabled: boolean;
  onChange(cli: CliId): void;
};

export function TutorPicker({ statuses, value, disabled, onChange }: Props) {
  const labelId = useId();
  const name = useId();
  return (
    <div>
      <span className="label" id={labelId}>
        Tutor
      </span>
      <div role="radiogroup" className="options" aria-labelledby={labelId}>
        {CLI_ORDER.map((id) => {
          const installed = statuses.some((s) => s.id === id && s.installed);
          let c = "option";
          if (value === id) c += " is-selected";
          if (!installed) c += " is-disabled";
          return (
            <label key={id} className={c}>
              <input
                type="radio"
                name={name}
                checked={value === id}
                onChange={() => onChange(id)}
                disabled={disabled || !installed}
              />
              <i />
              {installed ? cliName(id) : `${cliName(id)} · not installed`}
            </label>
          );
        })}
      </div>
    </div>
  );
}
