import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_METHOD } from "../../../core/prompt";
import { DEFAULT_SETTINGS, EFFORTS } from "../../../core/settings";
import { CLI_ORDER, cliName } from "../../../shared/clis";
import { METHOD_MAX, MODEL_MAX, PROFILE_MAX } from "../../../shared/limits";
import type { CliId, Settings } from "../../../shared/types";

const stored = (text: string): string =>
  text.trim() === "" || text.trim() === DEFAULT_METHOD ? "" : text;

export function ProfileScreen(props: { onTheme?(theme: Settings["theme"]): void }) {
  const [saved, setSaved] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const keyId = useId();
  const langId = useId();
  const voiceId = useId();
  const themeId = useId();
  const modelBase = useId();
  const methodId = useId();
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const [language, setLanguage] = useState("");
  const [voice, setVoice] = useState("");
  const [keyText, setKeyText] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [vStatus, setVStatus] = useState<string | null>(null);
  const [vFailed, setVFailed] = useState(false);
  const [theme, setTheme] = useState<Settings["theme"]>("dark");
  const [tStatus, setTStatus] = useState<string | null>(null);
  const [clis, setClis] = useState<Settings["clis"]>(DEFAULT_SETTINGS.clis);
  const [method, setMethod] = useState(DEFAULT_METHOD);
  const [mStatus, setMStatus] = useState<string | null>(null);
  const [mFailed, setMFailed] = useState(false);
  const [dStatus, setDStatus] = useState<string | null>(null);
  const [dFailed, setDFailed] = useState(false);
  const mBusy = useRef(false);
  const dBusy = useRef(false);
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
      setTheme(s.theme);
      setClis(s.clis);
      setMethod(s.method === "" ? DEFAULT_METHOD : s.method);
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

  async function chooseTheme(next: Settings["theme"]) {
    if (savedSettings === null) return;
    setTheme(next);
    props.onTheme?.(next);
    setTStatus(null);
    try {
      const r = await window.api.saveSettings({ ...savedSettings, theme: next });
      if (r.ok) setSavedSettings((s) => (s === null ? s : { ...s, theme: next }));
      else setTStatus(r.message);
    } catch {
      setTStatus("Could not save. Check free disk space.");
    }
  }

  const trimmedClis = (): Settings["clis"] => ({
    codex: { ...clis.codex, model: clis.codex.model.trim() },
    claude: { ...clis.claude, model: clis.claude.model.trim() },
    gemini: { ...clis.gemini, model: clis.gemini.model.trim() },
  });
  const modelsChanged =
    savedSettings !== null &&
    CLI_ORDER.some(
      (c) =>
        clis[c].model.trim() !== savedSettings.clis[c].model ||
        clis[c].effort !== savedSettings.clis[c].effort,
    );
  const methodChanged = savedSettings !== null && stored(method) !== savedSettings.method;

  function editCli(id: CliId, field: "model" | "effort", value: string) {
    setClis((c) => ({ ...c, [id]: { ...c[id], [field]: value } }));
    setMStatus(null);
  }

  function editMethod(text: string) {
    setMethod(text);
    setDStatus(null);
  }

  async function saveModels() {
    if (mBusy.current || savedSettings === null) return;
    mBusy.current = true;
    try {
      const next = { ...savedSettings, clis: trimmedClis() };
      const r = await window.api.saveSettings(next);
      if (r.ok) {
        setSavedSettings(next);
        setClis(next.clis);
        setMFailed(false);
        setMStatus("Saved.");
      } else {
        setMFailed(true);
        setMStatus(r.message);
      }
    } catch {
      setMFailed(true);
      setMStatus("Could not save. Check free disk space.");
    } finally {
      mBusy.current = false;
    }
  }

  async function saveMethod() {
    if (dBusy.current || savedSettings === null) return;
    dBusy.current = true;
    try {
      const next = { ...savedSettings, method: stored(method) };
      const r = await window.api.saveSettings(next);
      if (r.ok) {
        setSavedSettings(next);
        if (next.method === "") setMethod(DEFAULT_METHOD);
        setDFailed(false);
        setDStatus("Saved.");
      } else {
        setDFailed(true);
        setDStatus(r.message);
      }
    } catch {
      setDFailed(true);
      setDStatus("Could not save. Check free disk space.");
    } finally {
      dBusy.current = false;
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
        setSavedSettings((s) => (s === null ? s : { ...s, instructions: sent }));
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
      <div className="field">
        <label className="label" htmlFor={themeId}>
          Theme
        </label>
        <select
          id={themeId}
          value={theme}
          disabled={savedSettings === null}
          onChange={(e) => void chooseTheme(e.target.value as Settings["theme"])}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
        {tStatus !== null && <small>{tStatus}</small>}
      </div>
      <span className="label">Models</span>
      {CLI_ORDER.map((id) => {
        const modelId = `${modelBase}${id}-model`;
        const effortId = `${modelBase}${id}-effort`;
        return (
          <div role="group" aria-label={cliName(id)} key={id}>
            <span className="note">{cliName(id)}</span>
            <div className="field">
              <label className="label" htmlFor={modelId}>
                Model
              </label>
              <input
                id={modelId}
                maxLength={MODEL_MAX}
                value={clis[id].model}
                onChange={(e) => editCli(id, "model", e.target.value)}
              />
            </div>
            {EFFORTS[id].length > 0 && (
              <div className="field">
                <label className="label" htmlFor={effortId}>
                  Effort
                </label>
                <select
                  id={effortId}
                  value={clis[id].effort}
                  onChange={(e) => editCli(id, "effort", e.target.value)}
                >
                  <option value="">default</option>
                  {EFFORTS[id].map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        );
      })}
      {mStatus !== null &&
        (mFailed ? <small>{mStatus}</small> : <span className="note">{mStatus}</span>)}
      <div>
        <button
          className="btn is-primary"
          disabled={!modelsChanged}
          onClick={() => void saveModels()}
        >
          Save
        </button>
      </div>
      <div className="field">
        <label className="label" htmlFor={methodId}>
          Teaching method
        </label>
        <textarea
          id={methodId}
          maxLength={METHOD_MAX}
          value={method}
          onChange={(e) => editMethod(e.target.value)}
        />
        {dStatus !== null &&
          (dFailed ? <small>{dStatus}</small> : <span className="note">{dStatus}</span>)}
      </div>
      <div className="row">
        <button
          className="btn is-primary"
          disabled={!methodChanged}
          onClick={() => void saveMethod()}
        >
          Save
        </button>
        <button className="btn" onClick={() => editMethod(DEFAULT_METHOD)}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
