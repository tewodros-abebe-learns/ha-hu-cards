import type { FolderData } from './models';
export function folderPath(folder: FolderData, folders: FolderData[]): string {
  const names = [folder.name]; const visited = new Set([folder.id]);
  let parent = folders.find(f => f.id === folder.parentId);
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id); names.unshift(parent.name);
    parent = folders.find(f => f.id === parent!.parentId);
  }
  return names.join(' / ');
}
export function visibleSelection<T extends { id: string }>(selected: Set<string>, visible: T[]) {
  return new Set(visible.filter(item => selected.has(item.id)).map(item => item.id));
}
