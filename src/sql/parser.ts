import type { Lexer } from "./lexer";
import {
	type Token,
	TokenType,
	NodeType,
	type ASTNode,
	type SelectStatement,
	type CreateTableStatement,
	type InsertStatement,
	type BinaryExpression,
	type Literal,
	type Identifier,
	type ColumnDefinition,
} from "../shared/interfaces";

export class Parser {
	private lexer: Lexer;
	private currentToken: Token;

	constructor(lexer: Lexer) {
		this.lexer = lexer;
		this.currentToken = this.lexer.nextToken();
	}

	public parse(): ASTNode {
		if (this.peek(TokenType.Keyword, "SELECT")) {
			return this.parseSelect();
		}
		if (this.peek(TokenType.Keyword, "CREATE")) {
			return this.parseCreateTable();
		}
		if (this.peek(TokenType.Keyword, "INSERT")) {
			return this.parseInsert();
		}
		throw new Error(`Unexpected token: ${this.currentToken.value}`);
	}

	// --- Statement Parsers ---

	private parseSelect(): SelectStatement {
		this.consume(TokenType.Keyword, "Expected SELECT");
		const columns = this.parseColumnList();
		this.consume(TokenType.Keyword, "Expected FROM");
		const table = this.consume(
			TokenType.Identifier,
			"Expected table name"
		).value;

		let where: ASTNode | undefined;
		if (this.peek(TokenType.Keyword, "WHERE")) {
			this.consume(TokenType.Keyword, "Expected WHERE");
			where = this.parseExpression();
		}

		return {
			type: NodeType.SelectStatement,
			columns,
			table,
			where,
		};
	}

	private parseCreateTable(): CreateTableStatement {
		this.consume(TokenType.Keyword, "Expected CREATE");
		this.consume(TokenType.Keyword, "Expected TABLE");
		const table = this.consume(
			TokenType.Identifier,
			"Expected table name"
		).value;

		this.consume(TokenType.Punctuation, "Expected '('");

		const columns: ColumnDefinition[] = [];
		while (true) {
			const name = this.consume(
				TokenType.Identifier,
				"Expected column name"
			).value;
			const typeToken = this.consume(TokenType.Keyword, "Expected column type");

			// Validate Type
			const validTypes = ["INT", "TEXT", "BOOL"];
			if (!validTypes.includes(typeToken.value)) {
				throw new Error(`Invalid type: ${typeToken.value}`);
			}

			columns.push({ name, dataType: typeToken.value as any });

			if (this.peek(TokenType.Punctuation, ",")) {
				this.advance();
			} else {
				break;
			}
		}

		this.consume(TokenType.Punctuation, "Expected ')'");

		return {
			type: NodeType.CreateTableStatement,
			table,
			columns,
		};
	}

	private parseInsert(): InsertStatement {
		this.consume(TokenType.Keyword, "Expected INSERT");
		this.consume(TokenType.Keyword, "Expected INTO");
		const table = this.consume(
			TokenType.Identifier,
			"Expected table name"
		).value;

		// Parse Column Names: (id, name)
		this.consume(TokenType.Punctuation, "Expected '('");
		const columns: string[] = [];
		while (true) {
			columns.push(
				this.consume(TokenType.Identifier, "Expected column name").value
			);
			if (this.peek(TokenType.Punctuation, ",")) {
				this.advance();
			} else {
				break;
			}
		}
		this.consume(TokenType.Punctuation, "Expected ')'");

		// Parse Values: VALUES (1, 'Neo')
		this.consume(TokenType.Keyword, "Expected VALUES");
		this.consume(TokenType.Punctuation, "Expected '('");

		const values: any[] = [];
		while (true) {
			const literal = this.parsePrimary();
			if (literal.type !== NodeType.Literal) {
				throw new Error("Expected literal value in INSERT");
			}
			values.push((literal as Literal).value);

			if (this.peek(TokenType.Punctuation, ",")) {
				this.advance();
			} else {
				break;
			}
		}
		this.consume(TokenType.Punctuation, "Expected ')'");

		// Validation: Count Mismatch
		if (columns.length !== values.length) {
			throw new Error(
				`Column count (${columns.length}) does not match value count (${values.length})`
			);
		}

		// Zip columns and values into a Record
		const record: Record<string, any> = {};
		for (let i = 0; i < columns.length; i++) {
			record[columns[i]] = values[i];
		}

		return {
			type: NodeType.InsertStatement,
			table,
			values: record,
		};
	}

	private parseColumnList(): string[] {
		const columns: string[] = [];
		const token = this.currentToken;
		if (token.value === "*") {
			this.advance();
			columns.push("*");
		} else {
			while (true) {
				const colToken = this.consume(
					TokenType.Identifier,
					"Expected column name"
				);
				columns.push(colToken.value);

				if (this.peek(TokenType.Punctuation, ",")) {
					this.advance(); // consume ','
				} else {
					break;
				}
			}
		}
		return columns;
	}

	// --- Expression Parsers ---

	// Level 1: Logical (AND / OR)
	private parseExpression(): ASTNode {
		let left = this.parseComparison();

		while (
			this.peek(TokenType.Keyword, "AND") ||
			this.peek(TokenType.Keyword, "OR")
		) {
			const operator = this.currentToken.value;
			this.advance();
			const right = this.parseComparison();
			left = {
				type: NodeType.BinaryExpression,
				left,
				operator,
				right,
			} as BinaryExpression;
		}

		return left;
	}

	// Level 2: Comparison (=, >, <, etc.)
	private parseComparison(): ASTNode {
		let left = this.parsePrimary();

		if (
			this.currentToken.type === TokenType.Operator &&
			["=", ">", "<", ">=", "<=", "!="].includes(this.currentToken.value)
		) {
			const operator = this.currentToken.value;
			this.advance();
			const right = this.parsePrimary();
			left = {
				type: NodeType.BinaryExpression,
				left,
				operator,
				right,
			} as BinaryExpression;
		}

		return left;
	}

	// Level 3: Primary (Literals, Identifiers)
	private parsePrimary(): ASTNode {
		if (this.currentToken.type === TokenType.Number) {
			const value = this.currentToken.value;
			this.advance();
			return {
				type: NodeType.Literal,
				value: Number(value),
				dataType: "number",
			} as Literal;
		}

		if (this.currentToken.type === TokenType.String) {
			const value = this.currentToken.value;
			this.advance();
			return {
				type: NodeType.Literal,
				value: value,
				dataType: "string",
			} as Literal;
		}

		if (this.currentToken.type === TokenType.Keyword && (this.currentToken.value === "TRUE" || this.currentToken.value === "FALSE")) {
			const value = this.currentToken.value === "TRUE";
			this.advance();
			return {
				type: NodeType.Literal,
				value: value,
				dataType: "boolean",
			} as Literal;
		}

		if (this.currentToken.type === TokenType.Identifier) {
			const value = this.currentToken.value;
			this.advance();
			return {
				type: NodeType.Identifier,
				value,
			} as Identifier;
		}

		throw new Error(
			`Unexpected token in expression: ${this.currentToken.value}`
		);
	}

	// --- Helpers ---

	private peek(type: TokenType, value?: string): boolean {
		if (this.currentToken.type !== type) return false;
		if (value && this.currentToken.value.toUpperCase() !== value.toUpperCase())
			return false;
		return true;
	}

	private consume(type: TokenType, message: string): Token {
		if (this.peek(type)) {
			const token = this.currentToken;
			this.advance();
			return token;
		}
		throw new Error(`${message}. Found ${this.currentToken.value}`);
	}

	private advance() {
		this.currentToken = this.lexer.nextToken();
	}
}
