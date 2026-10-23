import { useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import type { User } from '../firebase';
import { profilePhotoCandidates } from '../profilePhoto';

export function ProfileAvatar({ user, className = '' }: { user: User | null; className?: string }) {
  const photos = profilePhotoCandidates(user);
  return <AvatarImage key={`${user?.uid}:${photos.join('|')}`} photos={photos} name={user?.displayName || ''} className={className} />;
}
function AvatarImage({ photos, name, className }: { photos: string[]; name: string; className: string }) {
  const [index, setIndex] = useState(0);
  return photos[index]
    ? <img src={photos[index]} alt={name ? `${name} profile picture` : 'Profile picture'} className={`${className} rounded-full object-cover`} referrerPolicy="no-referrer" onError={() => setIndex(value => value + 1)} />
    : <span className={`${className} rounded-full flex items-center justify-center text-indigo-200`} aria-label={name || 'Guest profile'}>{name ? name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('') : <UserIcon size={22} />}</span>;
}
