export class BloomFilter {
	private size: number;
	private hashes: number;
	private bitArray: Uint8Array;

	constructor(size: number = 64, hashes: number = 3) {
		this.size = size;
		this.hashes = hashes;
		this.bitArray = new Uint8Array(Math.ceil(size / 8));
	}

	add(key: string) {
		for (let i = 0; i < this.hashes; i++) {
			const hash = this.hash(key, i);
			const bitIndex = hash % this.size;
			const byteIndex = Math.floor(bitIndex / 8);
			const bitOffset = bitIndex % 8;

			this.bitArray[byteIndex] |= 1 << bitOffset;
		}
	}

	contains(key: string): boolean {
		for (let i = 0; i < this.hashes; i++) {
			const hash = this.hash(key, i);
			const bitIndex = hash % this.size;
			const byteIndex = Math.floor(bitIndex / 8);
			const bitOffset = bitIndex % 8;

			const byte = this.bitArray[byteIndex];
			if (byte === undefined || (byte & (1 << bitOffset)) === 0) {
				return false;
			}
		}
		return true;
	}
	serialize() {
		return Array.from(this.bitArray);
	}
	static deserialize(data: number[], size: number, hashes: number) {
		const bf = new BloomFilter(size, hashes);
		bf.bitArray.set(data);
		return bf;
	}

	// FNV-1a implementation
	private hash(str: string, seed: number = 0): number {
		let h = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		return (h >>> 0) + seed; // Force unsigned 32-bit
	}
}
