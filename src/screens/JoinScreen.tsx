import { useNavigate } from 'react-router';
import { useToast } from '../components/Toast';
import { SignUpScreen } from './auth/SignUpScreen';
import { t } from '../pack';

/** A GM who isn't a player joins from inside the app: no approval, so they land straight in the game. */
export default function JoinScreen() {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <SignUpScreen
      bare
      onCancel={() => navigate('/')}
      onDone={(status) => {
        if (status !== 'pending') toast(`You're in! Your secret ${t.quest.many} are in your Account.`, 'success');
        navigate(status === 'pending' ? '/' : '/account');
      }}
    />
  );
}
