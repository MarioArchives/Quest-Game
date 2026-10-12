import { Button } from '../../components/Button';
import look from '@pack';
import { t } from '../../pack';
import { useSession } from '../../session/SessionProvider';
import { PosterHeader } from './PosterHeader';
import './auth.css';

export function RejectedScreen() {
  const { signOut } = useSession();
  return (
    <div className="auth">
      <PosterHeader compact />
      <main className="auth__main auth__main--centre">
        <div className="auth__copy">
          <h2>Not this time</h2>
          <p>
            The {t.gm.One} couldn&apos;t fit you into this game. {look.auth.rejectedText}
          </p>
        </div>
        <div className="auth__actions auth__actions--row">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    </div>
  );
}
