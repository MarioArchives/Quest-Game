// The app bar on the board, the log book and the map: your case number, as on your file, in place of the game's name.
// The GM without a player file keeps the game's name.
import { pack } from '../../../pack';
import { useSession } from '../../../session/SessionProvider';
import { caseNumber } from '../dossier';

export function CaseTitle() {
  const { user, player } = useSession();
  if (!user || !player) return <>{pack.name}</>;
  return (
    <span className="case-title">
      <span className="case-title__k">Case no.</span>
      <span className="case-title__no">{caseNumber(user.uid)}</span>
    </span>
  );
}
