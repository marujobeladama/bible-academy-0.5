import { signOutAction } from '@/app/actions/auth';

export function LogoutButton() {
  return (
    <form action={signOutAction}>
      <button className="button secondary" type="submit">
        Sair
      </button>
    </form>
  );
}
