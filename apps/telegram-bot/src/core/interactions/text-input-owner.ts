type TextInputOwner = 'daily-plan' | 'report' | 'reminder' | 'statistics';

const ownersByUserId = new Map<number, TextInputOwner>();

export function claimTextInput(userId: number, owner: TextInputOwner): void {
  ownersByUserId.set(userId, owner);
}

export function releaseTextInput(userId: number, owner: TextInputOwner): void {
  if (ownersByUserId.get(userId) === owner) {
    ownersByUserId.delete(userId);
  }
}

export function ownsTextInput(userId: number, owner: TextInputOwner): boolean {
  return ownersByUserId.get(userId) === owner;
}
