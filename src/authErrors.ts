/** Keep provider/config failures actionable without exposing raw Firebase internals. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups for this site and try again.',
    'auth/unauthorized-domain': 'Google sign-in is not configured for this site address. The site administrator must add this domain to Firebase Authentication.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled. The site administrator must enable Google in Firebase Authentication.',
    'auth/network-request-failed': 'Sign-in could not connect. Check your connection and try again.',
    'auth/web-storage-unsupported': 'Sign-in needs browser storage. Enable cookies and site storage, then try again.',
    'auth/too-many-requests': 'Too many sign-in attempts. Wait a while before trying again.',
    'auth/user-disabled': 'This account is disabled. Contact the site administrator.',
    'auth/invalid-credential': 'The Google sign-in response expired or is invalid. Start sign-in again.'
  };
  return (code && messages[code]) || (error instanceof Error ? error.message : 'Sign-in failed. Please try again.');
}
