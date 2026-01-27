import { randomBytes } from "node:crypto";

/**
 * Generates a sortable unique ID similar to MongoDB's ObjectId.
 * 4 bytes: timestamp (seconds)
 * 5 bytes: random value
 * 3 bytes: incrementing counter
 */
export class StrataId {
	private static counter = Math.floor(Math.random() * 0xffffff);

	static generate(): string {
		const time = Math.floor(Date.now() / 1000);
		const bTime = Buffer.alloc(4);
		bTime.writeUInt32BE(time);

		const bRandom = randomBytes(5);

		const bCounter = Buffer.alloc(3);
		this.counter = (this.counter + 1) % 0xffffff;
		bCounter.writeUIntBE(this.counter, 0, 3);

		return Buffer.concat([bTime, bRandom, bCounter]).toString("hex");
	}

	static isValid(id: string): boolean {
		return /^[0-9a-fA-F]{24}$/.test(id);
	}
}
