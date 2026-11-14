import { useEffect, useId, useRef, useState } from "react";
import { PROFILE_MAX } from "../../../shared/limits";
import type { Settings } from "../../../shared/types";

export function ProfileScreen() {
  const [saved, setSaved] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const keyId = useId();
  const langId = useId();
  const voiceId = useId();
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [language, setLanguage] = useState("");
  const [voice, setVoice] = useState("");
  const [keyText, setKeyText] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [vStatus, setVStatus] = useState<string | null>(null);
  const [vFailed, setVFailed] = useState(false);
  const vBusy = useRef(false);
  const vEdited = useRef(false);
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

  useEffect(() => {
    let live = true;
    Promise.all([window.api.getSettings(), window.api.voiceHasKey()]).then(([s, k]) => {
      if (!live) return;
      setSavedSettings(s);
      setHasKey(k);
      if (!vEdited.current) {
        setLanguage(s.voice.language);
        setVoice(s.voice.voice);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  const voiceChanged =
    savedSettings !== null &&
    (language !== savedSettings.voice.language || voice !== savedSettings.voice.voice);

  async function saveVoice() {
    if (vBusy.current || savedSettings === null) return;
    vBusy.current = true;
    try {
      if (keyText !== "") {
        const r = await window.api.voiceSetKey(keyText);
        if (!r.ok) {
          setVFailed(true);
          setVStatus(r.message);
          return;
        }
        setKeyText("");
        setHasKey(true);
      }
      if (voiceChanged) {
        const next = { ...savedSettings, voice: { language, voice } };
        const r = await window.api.saveSettings(next);
        if (!r.ok) {
          setVFailed(true);
          setVStatus(r.message);
          return;
        }
        setSavedSettings(next);
      }
      setVFailed(false);
      setVStatus("Saved.");
    } catch {
      setVFailed(true);
      setVStatus("Could not save. Check free disk space.");
    } finally {
      vBusy.current = false;
    }
  }

  async function removeKey() {
    await window.api.voiceRemoveKey();
    setHasKey(false);
    setVStatus(null);
  }

  function editVoice(set: (v: string) => void, v: string) {
    vEdited.current = true;
    set(v);
    setVStatus(null);
  }

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
      <span className="label">Voice</span>
      {hasKey ? (
        <div className="row">
          <span className="note">Key saved</span>
          <button className="btn" onClick={() => void removeKey()}>
            Remove
          </button>
        </div>
      ) : (
        <div className="field">
          <label className="label" htmlFor={keyId}>
            Deepgram API key
          </label>
          <input
            id={keyId}
            type="password"
            autoComplete="off"
            value={keyText}
            onChange={(e) => editVoice(setKeyText, e.target.value)}
          />
        </div>
      )}
      <div className="field">
        <label className="label" htmlFor={langId}>
          Speech language
        </label>
        <input
          id={langId}
          value={language}
          onChange={(e) => editVoice(setLanguage, e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor={voiceId}>
          Voice
        </label>
        <input id={voiceId} value={voice} onChange={(e) => editVoice(setVoice, e.target.value)} />
        {vStatus !== null &&
          (vFailed ? <small>{vStatus}</small> : <span className="note">{vStatus}</span>)}
      </div>
      <div>
        <button
          className="btn is-primary"
          disabled={keyText === "" && !voiceChanged}
          onClick={() => void saveVoice()}
        >
          Save
        </button>
      </div>
    </div>
  );
}
