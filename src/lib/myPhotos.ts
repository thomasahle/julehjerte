/**
 * The visitor's own photos of hearts they have made ("Jeg har lavet det her" on a
 * heart's page): one photo per heart, kept in this browser only.
 *
 * They are in IndexedDB, not localStorage: a photo is far too big for
 * localStorage's few megabytes. Each is shrunk and saved again as a JPEG first
 * (`shrinkPhoto`), which keeps the store small and leaves out what the camera
 * wrote into the file, the place it was taken included.
 *
 * `myPhotos` maps a heart's id to an object URL of its photo, for an <img>. It is
 * empty until `loadMyPhotos` has run, which every component that shows the photos
 * calls when it mounts; the photos are read once per page load.
 *
 * Nothing here may break the page: where IndexedDB is missing or blocked (some
 * private modes) the store stays empty and saving reports a failure.
 */
import { writable } from 'svelte/store';
import { readStorage, writeStorage } from '$lib/utils/safeStorage';

/** Where visitors may send a photo for the site. */
export const PHOTO_MAIL = 'foto@juleflet.dk';
/**
 * Whether that address receives mail (it is forwarded by the domain's DNS host). When off, the
 * offer to mail a photo in is not shown.
 */
export const PHOTO_MAIL_READY = true;

/** The longer side of a stored photo, in px: enough for the heart page's big view on a sharp screen. */
export const PHOTO_MAX_SIDE = 1600;

const DB_NAME = 'juleflet-my-photos';
const STORE = 'photos';
/** How many photos this browser has saved, for `shouldSuggestMail`. */
const COUNT_KEY = 'juleflet-my-photos-saved';
/** The mail suggestion is shown with the first few photos only: it is an offer, not a toll. */
const SUGGEST_MAIL_TIMES = 3;

interface StoredPhoto {
	blob: Blob;
	addedAt: number;
}

/** Heart id → object URL of the visitor's photo of it. */
export const myPhotos = writable<Record<string, string>>({});

/** The size `width` x `height` shrinks to so its longer side is at most `max`; never enlarged. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
	const longer = Math.max(width, height);
	if (longer <= max || longer <= 0) return { width, height };
	const scale = max / longer;
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new Error('no IndexedDB'));
			return;
		}
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('IndexedDB failed'));
		request.onblocked = () => reject(new Error('IndexedDB blocked'));
	});
}

/** Runs `work` on the photo store in one transaction and resolves once it has committed. */
async function inStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await openDb();
	try {
		return await new Promise<T>((resolve, reject) => {
			const transaction = db.transaction(STORE, mode);
			const request = work(transaction.objectStore(STORE));
			transaction.oncomplete = () => resolve(request.result);
			transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'));
			transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'));
		});
	} finally {
		db.close();
	}
}

let loading: Promise<void> | null = null;

/** Reads the stored photos into `myPhotos`. Safe to call from every component; the read happens once. */
export function loadMyPhotos(): Promise<void> {
	if (typeof window === 'undefined') return Promise.resolve();
	loading ??= (async () => {
		try {
			const db = await openDb();
			const found: Record<string, string> = {};
			try {
				await new Promise<void>((resolve, reject) => {
					const transaction = db.transaction(STORE, 'readonly');
					const cursor = transaction.objectStore(STORE).openCursor();
					cursor.onsuccess = () => {
						const at = cursor.result;
						if (!at) return;
						const stored = at.value as StoredPhoto | undefined;
						if (stored?.blob instanceof Blob) found[String(at.key)] = URL.createObjectURL(stored.blob);
						at.continue();
					};
					transaction.oncomplete = () => resolve();
					transaction.onerror = () => reject(transaction.error);
					transaction.onabort = () => reject(transaction.error);
				});
			} finally {
				db.close();
			}
			// Photos saved while the read was under way stay.
			myPhotos.update((now) => ({ ...found, ...now }));
		} catch {
			// No store here: the visitor simply has no photos.
		}
	})();
	return loading;
}

/** The picture in `file`, turned the way the camera held it. */
async function readPicture(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
			return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
		} catch {
			// Some browsers refuse a format here that an <img> still reads.
		}
	}
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.decoding = 'async';
		image.src = url;
		await image.decode();
		return { source: image, width: image.naturalWidth, height: image.naturalHeight, done: () => URL.revokeObjectURL(url) };
	} catch (error) {
		URL.revokeObjectURL(url);
		throw error;
	}
}

/** The photo as a JPEG no bigger than PHOTO_MAX_SIDE. Throws when the file is not a picture this browser reads. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
	const picture = await readPicture(file);
	try {
		const { width, height } = fitWithin(picture.width, picture.height, PHOTO_MAX_SIDE);
		if (width <= 0 || height <= 0) throw new Error('empty picture');
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('no canvas');
		// A JPEG has no transparency: a cut-out picture gets white paper behind it, not black.
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
		context.drawImage(picture.source, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
		if (!blob) throw new Error('could not encode');
		return blob;
	} finally {
		picture.done();
	}
}

function show(id: string, url: string | null) {
	myPhotos.update((now) => {
		const next = { ...now };
		const old = next[id];
		if (old) URL.revokeObjectURL(old);
		if (url) next[id] = url;
		else delete next[id];
		return next;
	});
}

/** Saves `file` as the visitor's photo of heart `id`, replacing an earlier one. Throws when it cannot. */
export async function saveMyPhoto(id: string, file: Blob): Promise<void> {
	const blob = await shrinkPhoto(file);
	await loadMyPhotos();
	await inStore('readwrite', (store) => store.put({ blob, addedAt: Date.now() } satisfies StoredPhoto, id));
	show(id, URL.createObjectURL(blob));
	writeStorage(COUNT_KEY, String(savedCount() + 1));
	// Asks the browser not to clear the photos when it tidies up; Safari otherwise drops a site's
	// data after a week or so without a visit. It may say no, and that is fine.
	try {
		void navigator.storage?.persist?.().catch(() => {});
	} catch {
		// Not offered here.
	}
}

/** Takes away the visitor's photo of heart `id`. */
export async function removeMyPhoto(id: string): Promise<void> {
	await inStore('readwrite', (store) => store.delete(id));
	show(id, null);
}

function savedCount(): number {
	const count = Number(readStorage(COUNT_KEY));
	return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** Whether to offer, after a save, to mail the photo in: only with the first few. */
export function shouldSuggestMail(count: number = savedCount()): boolean {
	return count <= SUGGEST_MAIL_TIMES;
}

/** A mail to the site with the heart's name in the subject. The visitor attaches the photo themselves. */
export function photoMailHref(subject: string): string {
	return `mailto:${PHOTO_MAIL}?subject=${encodeURIComponent(subject)}`;
}
