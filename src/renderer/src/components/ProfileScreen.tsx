import { useEffect, useId, useRef, useState } from "react";
import { PROFILE_MAX } from "../../../shared/limits";

export function ProfileScreen() {
  const [saved, setSaved] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const busy = useRef(false);
  const edited = useRef(false);

  useEffect(() => {
    let live = true;
    window.api.getProfile().then((p) => {
      if (!live) return;
      setSaved(p);
      if (!edited.current) setText(p);
    });
    return () => {
      live = false;
    };
  }, []);

  async function save() {
    if (busy.current) return;
    busy.current = true;
    const sent = text;
    try {
      const result = await window.api.saveProfile(sent);
      if (result.ok) {
        setSaved(sent);
        setFailed(false);
        setStatus("Saved.");
      } else {
        setFailed(true);
        setStatus(result.message);
      }
    } catch {
      setFailed(true);
      setStatus("Could not save. Check free disk space.");
    } finally {
      busy.current = false;
    }
  }

  return (
    <div className="content">
      <h3>Profile</h3>
      <p className="note">
        Tell your tutor how you want to be taught. It is added to every lesson from the next reply
        on.
      </p>
      <div className="field">
        <label className="label" htmlFor={id}>
          Tutor instructions
        </label>
        <textarea
          id={id}
          maxLength={PROFILE_MAX}
          placeholder="e.g. Explain like I'm a nurse. Use more worked examples. Keep readings short."
          value={text}
          onChange={(e) => {
            edited.current = true;
            setText(e.target.value);
            setStatus(null);
          }}
        />
        {status !== null &&
          (failed ? <small>{status}</small> : <span className="note">{status}</span>)}
      </div>
      <div>
        <button className="btn is-primary" disabled={text === saved} onClick={() => void save()}>
          Save
        </button>
      </div>
    </div>
  );
}
