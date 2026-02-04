import { access, constants } from "fs/promises";

export class Utils {
	static file_exists = async (path: string) => {
		try {
			await access(path, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	};
}
