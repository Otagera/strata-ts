import type { Lexer } from "./lexer";
import {
	type Token,
	TokenType,
	NodeType,
	type ASTNode,
	type SelectStatement,
	type BinaryExpression,
	type Literal,
	type Identifier,
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
		throw new Error(`Unexpected token: ${this.currentToken.value}`);
	}

	// --- Statement Parsers ---

	private parseSelect(): SelectStatement {
		this.consume(TokenType.Keyword, "Expected SELECT");
		const columns = this.parseColumnList();
		this.consume(TokenType.Keyword, "Expected FROM");
		const table = this.consume(TokenType.Identifier, "Expected table name").value;

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