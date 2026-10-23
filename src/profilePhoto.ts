export function profilePhotoCandidates(user: { photoURL?: string | null; providerData?: readonly { providerId: string; photoURL?: string | null }[] } | null | undefined): string[] {
  const google = user?.providerData?.find(provider => provider.providerId === 'google.com');
  return [...new Set([google?.photoURL, user?.photoURL].filter((url): url is string => {
    if (!url) return false;
    try { return new URL(url).protocol === 'https:'; } catch { return false; }
  }))];
}
