// The locker's Setup tab: the settings as folds (one open at a time), the deck of tampering missions, the route (on
// the Map) and Reset, which takes the case back to the lobby.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useGame } from '../../../data/GameProvider';
import { features, t } from '../../../pack';
import { ResetSheet } from '../../../screens/gm/GameSection';
import { SettingsSection } from '../../../screens/gm/SettingsSection';
import { Folder } from './CaseKit';
import type { LockerNav } from './LockerParts';

export function Setup({ nav }: { nav: LockerNav }) {
  const { templatesById } = useGame();
  const navigate = useNavigate();
  const [resetting, setResetting] = useState(false);
  const deck = [...templatesById.values()].filter((tpl) => tpl.scope === 'personal' && tpl.active).length;
  return (
    <>
      <Folder tab="Settings" label="Settings" className="gl-folder gl-engine gl-settings">
        <SettingsSection folds />
      </Folder>
      <Folder tab={`${t.quest.Many} · ${deck} in the deck`} label={t.quest.Many} className="gl-folder">
        <p className="gl-hint">Add, edit or retire the secret missions dealt to suspects.</p>
        <button type="button" className="gl-open" onClick={() => nav.open('templates')}>
          Open the deck ›
        </button>
      </Folder>
      {features.map ? (
        <Folder tab="Route" label="Route" className="gl-folder">
          <p className="gl-hint">The crawl&apos;s stops are planned, timed and revealed on the Map.</p>
          <button type="button" className="gl-open" onClick={() => void navigate('/map')}>
            Open the Map ›
          </button>
        </Folder>
      ) : null}
      <Folder tab="Reset" label="Reset" className="gl-folder">
        <p className="gl-hint">Back to the lobby for a new round: suspects, evidence and scores go; missions, settings and the route stay.</p>
        <button type="button" className="gl-reset" onClick={() => setResetting(true)}>
          Reset the case…
        </button>
      </Folder>
      {resetting ? <ResetSheet onClose={() => setResetting(false)} /> : null}
    </>
  );
}
