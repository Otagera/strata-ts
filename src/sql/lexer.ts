import { TokenType, type Token } from "../shared/interfaces";

export class Lexer {
	private source: string;
	private cursor: number = 0;
	private keywords: Set<string> = new Set([
		"SELECT",
		"FROM",
		"WHERE",
		"AND",
		"OR",
		"INSERT",
		"INTO",
		"VALUES",
		"UPDATE",
		"SET",
		"DELETE",
		"CREATE",
		"TABLE",
		"INT",
		"BOOL",
		"TEXT",
		"TRUE",
		"FALSE",
	]);

	constructor(source: string) {
		this.source = source;
	}

	/**
	 * The main engine: returns the next token from the source string.
	 */
	public nextToken(): Token {
		this.skipWhitespace();

		if (this.isAtEnd()) {
			return { type: TokenType.EOF, value: "" };
		}

		const char = this.peek();

		// 1. Numbers
		if (this.isDigit(char)) {
			return this.readNumber();
		}

		// 2. Identifiers & Keywords
		if (this.isAlpha(char)) {
			return this.readIdentifier();
		}

		// 3. Strings
		if (char === "'") {
			return this.readString();
		}

		// 4. Operators & Punctuation
		return this.readSymbol();
	}

	// --- Helpers ---

	private peek(): string {
		const element = this.source[this.cursor];
		if (element) {
			return element;
		} else {
			return "";
		}
	}

	private advance(): string {
		return this.source[this.cursor++];
	}

	private isAtEnd(): boolean {
		return this.cursor >= this.source.length;
	}

	private isDigit(char: string): boolean {
		return /[0-9]/.test(char);
	}

	private isAlpha(char: string): boolean {
		return /[a-zA-Z_]/.test(char);
	}

	private isIdentifier(char: string): boolean {
		return /[a-zA-Z0-9_]/.test(char);
	}

	private skipWhitespace() {
		while (!this.isAtEnd() && /\s/.test(this.peek())) {
			this.advance();
		}
	}

	// --- Implementation ---

	private readNumber(): Token {
		let value = "";
		while (this.isDigit(this.peek())) {
			value += this.advance();
		}

		return { type: TokenType.Number, value };
	}

	private readIdentifier(): Token {
		let str = "";
		while (this.isIdentifier(this.peek())) {
			str += this.advance();
		}

		if (this.keywords.has(str.toUpperCase())) {
			return { type: TokenType.Keyword, value: str.toUpperCase() };
		} else {
			return { type: TokenType.Identifier, value: str };
		}
	}

	private readString(): Token {
		this.advance();
		let value = "";

		while (!this.isAtEnd() && this.peek() !== "'") {
			value += this.advance();
		}

		if (this.isAtEnd()) {
			throw new Error("Unterminated string literal");
		}
		this.advance();

		return { type: TokenType.String, value };
	}

	private readSymbol(): Token {
		const char = this.advance();

		// Two-character operators
		if (char === ">" && this.peek() === "=") {
			this.advance();
			return { type: TokenType.Operator, value: ">=" };
		}
		if (char === "<" && this.peek() === "=") {
			this.advance();
			return { type: TokenType.Operator, value: "<=" };
		}
		if (char === "!" && this.peek() === "=") {
			this.advance();
			return { type: TokenType.Operator, value: "!=" };
		}

		// Single-character operators
		if (["=", ">", "<", "*"].includes(char)) {
			return { type: TokenType.Operator, value: char };
		}

		// Punctuation
		if ([",", "(", ")"].includes(char)) {
			return { type: TokenType.Punctuation, value: char };
		}

		throw new Error(`Unexpected character: ${char}`);
	}
}
