// Edge cases 12–13: Storage security rules. The Storage emulator's firestore.exists()/get() lookups
// only see the emulator's own project, so this file must use demo-quest-game.
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getMetadata, listAll, ref, uploadBytes, type FirebaseStorage } from 'firebase/storage';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-quest-game',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const MiB = 1024 * 1024;
const bytes = (n: number) => new Uint8Array(n);
const jpeg = { contentType: 'image/jpeg' };

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'players/alice'), { displayName: 'Alice', points: 0 });
    await setDoc(doc(db, 'players/bob'), { displayName: 'Bob', points: 0 });
    await setDoc(doc(db, 'admins/gm'), { email: 'gm@example.com' });
    const st = c.storage();
    await uploadBytes(ref(st, 'avatars/alice/1.jpg'), bytes(1000), jpeg);
    await uploadBytes(ref(st, 'avatars/stranger/1.jpg'), bytes(1000), jpeg);
    await uploadBytes(ref(st, 'submissions/alice/seed.jpg'), bytes(2000), jpeg);
  });
});

const as = (uid: string): FirebaseStorage => env.authenticatedContext(uid).storage() as unknown as FirebaseStorage;
const anon = (): FirebaseStorage => env.unauthenticatedContext().storage() as unknown as FirebaseStorage;

describe('12. avatars', () => {
  it('the owner can upload an image under 1 MiB before joining', async () => {
    await assertSucceeds(uploadBytes(ref(as('stranger'), 'avatars/stranger/2.jpg'), bytes(25_000), jpeg));
    await assertSucceeds(uploadBytes(ref(as('stranger'), 'avatars/stranger/3.jpg'), bytes(MiB - 1), jpeg));
  });

  it('rejects 1 MiB or more, non-images, other folders and signed-out users', async () => {
    await assertFails(uploadBytes(ref(as('stranger'), 'avatars/stranger/big.jpg'), bytes(MiB), jpeg));
    await assertFails(uploadBytes(ref(as('stranger'), 'avatars/stranger/x.txt'), bytes(100), { contentType: 'text/plain' }));
    await assertFails(uploadBytes(ref(as('stranger'), 'avatars/alice/2.jpg'), bytes(100), jpeg));
    await assertFails(uploadBytes(ref(anon(), 'avatars/stranger/2.jpg'), bytes(100), jpeg));
  });

  it('the owner, players and the GM can read; other signed-in users cannot', async () => {
    await assertSucceeds(getMetadata(ref(as('alice'), 'avatars/alice/1.jpg')));
    await assertSucceeds(getMetadata(ref(as('bob'), 'avatars/alice/1.jpg')));
    await assertSucceeds(getMetadata(ref(as('gm'), 'avatars/stranger/1.jpg'))); // GM reviewing a join request
    await assertSucceeds(getMetadata(ref(as('stranger'), 'avatars/stranger/1.jpg')));
    await assertFails(getMetadata(ref(as('stranger'), 'avatars/alice/1.jpg')));
    await assertFails(getMetadata(ref(anon(), 'avatars/alice/1.jpg')));
  });

  it('avatars cannot be overwritten or deleted', async () => {
    await assertFails(uploadBytes(ref(as('alice'), 'avatars/alice/1.jpg'), bytes(100), jpeg));
    await assertFails(deleteObject(ref(as('alice'), 'avatars/alice/1.jpg')));
  });
});

describe('13. submission photos', () => {
  it('players upload images under 5 MiB into their own folder', async () => {
    await assertSucceeds(uploadBytes(ref(as('alice'), 'submissions/alice/s1.jpg'), bytes(500_000), jpeg));
    await assertSucceeds(uploadBytes(ref(as('alice'), 'submissions/alice/s1_thumb.jpg'), bytes(5 * MiB - 1), jpeg));
  });

  it("rejects 5 MiB or more, non-images, other players' folders and non-players", async () => {
    await assertFails(uploadBytes(ref(as('alice'), 'submissions/alice/big.jpg'), bytes(5 * MiB), jpeg));
    await assertFails(uploadBytes(ref(as('alice'), 'submissions/alice/x.pdf'), bytes(100), { contentType: 'application/pdf' }));
    await assertFails(uploadBytes(ref(as('alice'), 'submissions/bob/s1.jpg'), bytes(100), jpeg));
    await assertFails(uploadBytes(ref(as('stranger'), 'submissions/stranger/s1.jpg'), bytes(100), jpeg));
  });

  it('players and the GM can read photos; non-players and signed-out users cannot', async () => {
    await assertSucceeds(getMetadata(ref(as('alice'), 'submissions/alice/seed.jpg')));
    await assertSucceeds(getMetadata(ref(as('bob'), 'submissions/alice/seed.jpg')));
    await assertSucceeds(getMetadata(ref(as('gm'), 'submissions/alice/seed.jpg')));
    await assertFails(getMetadata(ref(as('stranger'), 'submissions/alice/seed.jpg')));
    await assertFails(getMetadata(ref(anon(), 'submissions/alice/seed.jpg')));
  });

  it('nobody can list, overwrite or delete photos', async () => {
    await assertFails(listAll(ref(as('alice'), 'submissions/alice')));
    await assertFails(listAll(ref(as('gm'), 'submissions/alice')));
    await assertFails(uploadBytes(ref(as('alice'), 'submissions/alice/seed.jpg'), bytes(100), jpeg));
    await assertFails(deleteObject(ref(as('alice'), 'submissions/alice/seed.jpg')));
    await assertFails(deleteObject(ref(as('gm'), 'submissions/alice/seed.jpg')));
  });
});
